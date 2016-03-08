/**
 * Created by Mat on 2/03/2016.
 */
(function(){
    'use strict';
    angular
        .module('annoweb-audio', [])
        .directive('ngRecord', function() {
            return {
                restrict: 'E',
                templateUrl: 'views/templates/record-template.html',
                controller: newRecordDirectiveController,
                controllerAs: 'nrCtrl'
            };
        })
        .directive("ngRespeak", function() {
            return {
                restrict: "E",
                templateUrl: "views/templates/respeak-template.html",
                controller: respeakDirectiveController,
                controllerAs: 'rCtrl'
            };
        });
    
    var newRecordDirectiveController = function ($scope, $location, $window, loginService, audioService, dataService, fileService, $sce) {
        var vm = this;
        var rec;

        var doublemode = true;

        $scope.recording = '';

        if (doublemode) {vm.context = new AudioContext();}

        vm.wsRecord = Object.create(WaveSurfer);
        vm.wsRecord.init({
            container: "#respeakRecord",
            normalize: false,
            scrollParent: true,
            cursorWidth: 0
        });

        // Init Microphone plugin
        var microphone = Object.create(WaveSurfer.Microphone);
        microphone.init({
            wavesurfer: vm.wsRecord
        });
        microphone.on('deviceReady', function() {
            console.info('Device ready!');
            if (doublemode) {
                microphone.play();
                $scope.$apply(function() {
                    $scope.recordClass = 'activespeaker';
                });
            } else {
                rec = new Recorder(microphone.mediaStreamSource,{numChannels: 1});
            }
        });
        microphone.on('deviceError', function(code) {
            console.warn('Device error: ' + code);
        });

        microphone.start();

        if (doublemode) {
            // start our own audio context for recorder.js. Because calling pause() on the wavesurfer microphone
            // plugin disconnects the node, we'll end up with an empty file!
            navigator.mediaDevices.getUserMedia({video: false, audio: true})
                .then(function (mediastream) {
                    vm.streamsource = vm.context.createMediaStreamSource(mediastream);
                    rec = new Recorder(vm.streamsource, {numChannels: 1});
                })
                .catch(function (feh) {
                    console.log('audio spaz', feh);
                });
        }

        function createDownsampledLink(targetSampleRate) {
            rec.getBuffer(function(buf){
                vm.recordDurMsec = Math.floor(buf[0].length / (microphone.micContext.sampleRate/1000));
                console.log('rt', vm.recordDurMsec);
                
                audioService.resampleAudioBuffer(microphone.micContext,buf,targetSampleRate,function(thinggy){
                    //var url = thinggy.getFile();
                    //$scope.recording=$sce.trustAsResourceUrl(url);
                    
                    var blob = thinggy.getFile();
                    fileService.createFile(loginService.getLoggedinUserId(), blob).then(function(url) {
                        vm.recordUrl = url;
                        $scope.recording=$sce.trustAsResourceUrl(url);
                    });
                });
            });
        }

        vm.hasrecording = function() {
            return $scope.recording !== '';
        };

        
        vm.isrecording = false;
        $scope.recordClass = 'inactivespeaker'; // becomes activespeaker when user permits microphone

        function spacedown () {
            if(!vm.recordUrl) {
                if (!vm.isrecording) {
                    console.log('starting record');
                    rec.record();

                    $scope.recordClass = 'activerecord';
                    vm.isrecording=true;
                    $scope.$apply();
                } else {
                    console.log('stopping record');
                    rec.stop();
                    vm.wsRecord.empty();

                    $scope.recordClass = 'activespeaker';
                    vm.isrecording = false;
                    $scope.$apply();
                }
                return false;
            } else {
                return true;
            }
        }

        // We must use this because the underlying library (mousetrap) used by angular-hotkeys does
        // not provide any way to handle keys that are held down, e.g. ignoring repeated events.
        //
        var listener = new $window.keypress.Listener();
        listener.register_combo({
            "keys"              : 'space',
            "on_keydown"        :spacedown,
            "prevent_repeat"    :true
        });

        vm.check = function() {
            // Disable/Clean microphone/recorder
            $scope.recordClass = 'inactivespeaker';
            microphone.pause();
            if(vm.isRecording) {
                rec.stop();
                vm.wsRecord.empty();
                
                vm.isrecording = false;
                $scope.$apply();
            }
            
            // File created and url is stored
            createDownsampledLink(22050);
            //createDownsampledLink(48000);
        };
        
        vm.isMetaEmpty = function() {
            return vm.recordUrl === '' || vm.selectedLanguages.length === 0 || vm.selectedTitles.length === 0;
        };
        
        vm.save = function() {
            var fileObjId;
            dataService.get('user', loginService.getLoggedinUserId()).then(function(userObj) {
                // Add fileObj to user metadata
                var fileObj = {
                    url: vm.recordUrl,
                    type: 'audio/wav'
                };
                
                fileObjId = userObj.addUserFile(fileObj);
                return userObj.save();
            }).then(function() {
                // Create new session metadata
                var sessionData = {};
                sessionData.names = vm.selectedTitles;
                sessionData.creatorId = loginService.getLoggedinUserId();
                sessionData.source = {
                    recordingFileId: fileObjId,
                    created: Date.now(),
                    duration: vm.recordDurMsec,
                    langIds: vm.selectedLanguages.map(function(lang) { return lang.id; })
                };
                
                return dataService.setSession(loginService.getLoggedinUserId(), sessionData);
            }).then(function(sessionId) {
                // Recording file and session metadata are both created
                vm.isCompleted = true;
                
                $location.path('session/'+sessionId);
            });
        };

        vm.reset = function() {
            rec.stop();
            rec.clear();
            $scope.recordClass = 'inactivespeaker';
            $scope.recording = '';
        };

        $scope.$on('$destroy', function() {
            listener.destroy();
            if(rec)
                rec.clear();
        });
        
        $window.onbeforeunload = function() {
            // When a file is created but metadata is not
            if(vm.recordUrl && !vm.isCompleted)
                fileService.deleteFile(vm.recordUrl);
        };
        
        /////////////////////////////// 
        vm.isCompleted = false;
        vm.recordUrl = '';
        vm.recordDurMsec = 0;
        
        vm.selectedTitles = [];
        vm.selectedLanguages = [];
        vm.langFilterOn = true;
        
        vm.langPlaceholder = "Add languages";
        vm.langSecPlaceholder = "Add more";
        vm.titlePlaceholder = "Add titles";
        vm.titleSecPlaceholder = "Add more";
        
        // Language input interface for session
        fileService.getLanguages().then(function(langObjList) {
            var langList = langObjList.map(function(langObj) {
                return {
                    id: langObj.Id,
                    name: langObj.Ref_Name,
                    value: langObj.Ref_Name.toLowerCase()
                };
            });
            
            vm.langQuerySearch = function(query) {
                var results = [];
                query = query.toLowerCase();
                if(query) {
                    results = langList.filter(function(lang) {
                        return lang.value.indexOf(query) === 0;
                    });
                }
                return results;
            };
        });

    };
    newRecordDirectiveController.$inject = ['$scope', '$location', '$window', 'loginService', 'audioService', 'dataService', 'fileService', '$sce'];

    var respeakDirectiveController = function ($scope, $window, $attrs, loginService, audioService, dataService, fileService, $sce) {
        var vm = this;
        var rec;

        var doublemode = true;
        vm.isplaying = false;
        vm.isrecording = false;

        $scope.recording = '';
        // vm.sessionData is never used. this controller is used in the directive ngRespeak not in respeak.html
        /*dataService.get("session", $attrs.sessionId).then(function(sd) {
            vm.sessionData = sd.data;
            console.log(vm.sessionData);
        });*/

        if (doublemode) {vm.context = new AudioContext();}

        vm.segments = [];
        
        vm.wsPlayback = Object.create(WaveSurfer);
        vm.wsPlayback.init({
            container: "#respeakPlayback",
            normalize: true,
            hideScrollbar: false,
            scrollParent: true
        });
        /* Initialize the time line */
        vm.timeline = Object.create(vm.wsPlayback.Timeline);
        vm.timeline.init({
            wavesurfer: vm.wsPlayback,
            container: "#respeak-timeline"
        });
        /* Minimap plugin */
        vm.wsPlayback.initMinimap({
            height: 40,
            waveColor: '#555',
            progressColor: '#999',
            cursorColor: '#999'
        });

        vm.wsPlayback.load('media/elan-example1.mp3');

        vm.wsRecord = Object.create(WaveSurfer);
        vm.wsRecord.init({
            container: "#respeakRecord",
            normalize: false,
            scrollParent: true,
            cursorWidth: 0
        });

        // Init Microphone plugin
        var microphone = Object.create(WaveSurfer.Microphone);
        microphone.init({
            wavesurfer: vm.wsRecord
        });
        microphone.on('deviceReady', function() {
            console.info('Device ready!');
            if (doublemode) {
                microphone.pause();
            } else {
                rec = new Recorder(microphone.mediaStreamSource,{numChannels: 1});
            }
        });
        microphone.on('deviceError', function(code) {
            console.warn('Device error: ' + code);
        });

        microphone.start();

        if (doublemode) {
            // start our own audio context for recorder.js. Because calling pause() on the wavesurfer microphone
            // plugin disconnects the node, we'll end up with an empty file!
            navigator.mediaDevices.getUserMedia({video: false, audio: true})
                .then(function (mediastream) {
                    vm.streamsource = vm.context.createMediaStreamSource(mediastream);
                    rec = new Recorder(vm.streamsource, {numChannels: 1});
                })
                .catch(function (feh) {
                    console.log('audio spaz', feh);
                });
        }

        function createDownsampledLink(targetSampleRate) {
            rec.getBuffer(function(buf){
                audioService.resampleAudioBuffer(microphone.micContext,buf,targetSampleRate,function(thinggy){
                    //var url = thinggy.getFile();
                    //$scope.recording=$sce.trustAsResourceUrl(url);
                    
                    var blob = thinggy.getFile();
                    fileService.createFile(loginService.getLoggedinUserId(), blob).then(function(url) {
                        $scope.recording=$sce.trustAsResourceUrl(url);
                    });
                });
            });
        }

        vm.hasrecording = function() {
            return $scope.recording !== '';
        };

        vm.playrecturn = 'play';
        vm.begunrecording = false;
        $scope.playbackClass = 'activespeaker';
        $scope.recordClass = 'inactivespeaker';

        function spaceup () {
            // if already playing... then stop and switch to record mode
            if (vm.wsPlayback.isPlaying() && vm.playrecturn == 'play') {
                vm.playrecturn = 'record';
                microphone.play();
                $scope.playbackClass = 'inactivespeaker';
                $scope.recordClass = 'activespeaker';
                vm.wsPlayback.playPause();
                vm.isplaying=false;
                $scope.$apply();
                return;
            }
            // if not playing then we were recording, so go to play mode
            if (!vm.wsPlayback.isPlaying() && vm.playrecturn == 'record' ) {
                console.log('stopping record');
                rec.stop();
                vm.isrecording = false;

                if (doublemode) {microphone.pause();}
                vm.wsRecord.empty();
                vm.playrecturn = 'play';
                $scope.playbackClass = 'activespeaker';
                $scope.recordClass = 'inactivespeaker';
                $scope.$apply();
            }
        }

        function spacedown () {
            // if we weren't playing already ...
            if (!vm.wsPlayback.isPlaying()) {
                if (vm.playrecturn === 'play') {

                    // if we have previously recorded a buffer, then make a segment now
                    if (vm.begunrecording) {
                        rec.getBuffer(function (buf) {
                            var reclength = buf[0].length;
                            makeSegment(reclength);
                        });
                    }

                    vm.wsPlayback.playPause();
                    vm.isplaying=true;
                    $scope.$apply();
                    return;
                }
                if (vm.playrecturn === 'record') {
                    vm.begunrecording = true;
                    $scope.recordClass = 'activerecord';
                    $scope.$apply();
                    vm.isrecording=true;
                    console.log('starting record');
                    rec.record();
                    $scope.$apply();
                }
            }
        }

        // We must use this because the underlying library (mousetrap) used by angular-hotkeys does
        // not provide any way to handle keys that are held down, e.g. ignoring repeated events.
        //
        var listener = new $window.keypress.Listener();
        listener.register_combo({
            "keys"              : 'space',
            "on_keydown"        :spacedown,
            "on_keyup"          :spaceup,
            "prevent_repeat"    :true
        });

        vm.save = function() {
            createDownsampledLink(22050);
            //createDownsampledLink(48000);
        };

        vm.reset = function() {
            vm.lastRec = 0;
            vm.lastPlay = 0;
            rec.stop();
            rec.clear();
            vm.wsPlayback.stop();
            $scope.segments = [];
            vm.playrecturn = 'play';
            $scope.playbackClass = 'activespeaker';
            $scope.recordClass = 'inactivespeaker';
            $scope.recording = '';
        };

        vm.lastRec = 0;
        vm.lastPlay = 0;
        function makeSegment(recordpoint) {
            var rectime = Math.floor(recordpoint / (microphone.micContext.sampleRate/1000));
            console.log('rt',rectime);
            var playtime = Math.floor(vm.wsPlayback.getCurrentTime()*1000);
            vm.segments.push({
                'source': [vm.lastPlay, playtime],
                'respeak': [vm.lastRec, rectime]
            });
            vm.lastPlay = playtime;
            vm.lastRec = rectime;
            $scope.$apply();
        }

        $scope.$on('$destroy', function() {
            listener.destroy();
            vm.wsPlayback.destroy();
            vm.wsPlayback.destroy();
            if(rec)
                rec.clear();
        });

    };
    respeakDirectiveController.$inject = ['$scope', '$window', '$attrs', 'loginService', 'audioService', 'dataService', 'fileService', '$sce'];

})();