/**
 * Created by Mat on 4/02/2016.
 */
(function(){
    'use strict';
    angular
        .module('aikuma-annotation', [])
        .directive("ngAnnotator", function() {
            return {
                restrict: "E",
                templateUrl: "views/templates/annotate-template.html",
                scope: true,
                controller: annotationController,
                controllerAs: 'axCtrl'
            };
        });

    // The new annotation controller.
    var annotationController = function ($scope, keyService, aikumaService, $timeout, $mdDialog, aikumaDialog, $translate) {
        var vm = this;
        var playKeyCode = 17;   // control key (16 is shift)
        var ffKeyCode = 39;     // right arrow
        var rwKeyCode = 37;     // left arrow
        var escKeyCode = 27;    // escape
        var tabKeyCode = 9;     // tab - also prevents default
        var ffPlaybackRate = 2.5; // playback speed in FF mode
        var skipTimeValue = 3;  // amount of time to skip backwards for rewind
        var oneMillisecond = 0.001;
        var wsAnnotate, timeline, miniMap;

        function markLastRegionComplete() {
            var colidx = _.last(vm.regionList).data.colidx;
            var hue = 198 + (colidx*40);
            _.last(vm.regionList).update(
                {
                    color: 'hsla('+hue+', 100%, 30%, 0.1)',
                    data: {colidx:colidx}
                }
            );
            vm.playIn = _.last(vm.regionList).end;
        }

        function hasAnnotations() {
            return true;
        }
        // Often we force seek to play-in because we don't allow the user to play back where they cannot record.
        function seekToPlayin() {
            var length = wsAnnotate.getDuration();
            var floatpos = vm.playIn / length;
            wsAnnotate.seekTo(floatpos);
        }
        function seekToTime(time) {
            var length = wsAnnotate.getDuration();
            var floatpos = time / length;
            wsAnnotate.seekTo(floatpos);
        }
        // make a new region list out of an array of millisecond segments
        function makeWSRegions(segMsec) {
            vm.regionList = [];
            segMsec.forEach(function(seg) {
                var stime = seg[0] / 1000;
                var etime = seg[1] / 1000;
                makeNewRegion(stime);
                _.last(vm.regionList).update({end:etime});
                markLastRegionComplete();
            });
        }
        function playAudio(annoIdx,region) {
            vm.regionList[region].play();
        }
        // Post Wavesurfer start initialisation
        function initializeRegions() {
            aikumaService.getLanguages(function(langs){
                vm.annoList = vm.annotations.map(function(anno) {
                    return {
                        _ID: anno.data._ID,
                        name: aikumaService.lookupLanguage(anno.data.source.langIds[0], langs),
                        type: angular.uppercase(anno.data.type),
                        enabled: anno.data._ID === $scope.selectedAnno,
                        loop: false,
                        annos: {}
                    };
                });
                vm.selectedAnno = _.findIndex(vm.annoList, function(anno) {
                    return anno._ID === $scope.selectedAnno;
                });

                //shitty restore
                if (vm.annotations[0].data.segment.annotations) {
                    var segmentId = vm.annotations[0].data.segment.sourceSegId;
                    makeWSRegions($scope.sessionObj.data.segments[segmentId]);
                    console.log(vm.annoList);
                    vm.annoList[0].annos = vm.annotations[0].data.segment.annotations;
                }

                $scope.$apply();
            });
            // restore child
            if (vm.respeakings.length) {
                vm.hasRespeaking = true;
                vm.rSeg = vm.respeakings[0].segment.segMsec;
            } else {
                vm.hasRespeaking = false;
            }
            if (vm.translations.length) {
                vm.hasTranslation = true;
                vm.tSeg = vm.translations[0].segment.segMsec;
            } else {
                vm.hasTranslation = false;
            }



        }

        // Pass index of annotation to save, depends on globals vm.regionList, vm.annotations and vm.annoList
        function saveAnnotation(annoIdx) {
            var annotext = [];
            var seglist = [];
            // make simple data structures to poke into the db
            vm.regionList.forEach(function(reg,idx){
                annotext.push(vm.annoList[annoIdx].annos[idx]);
                seglist.push([Math.round(reg.start * 1000),Math.round(reg.end * 1000)]);
            });
            var segmentId;
            if (vm.annotations[annoIdx].data.segment.hasOwnProperty('"sourceSegId"')) {
                segmentId = vm.annotations[annoIdx].data.segment.sourceSegId;
                $scope.sessionObj.setSrcSegment(segmentId, seglist);
            } else {
                segmentId = $scope.sessionObj.addSrcSegment(seglist);
                vm.annotations[annoIdx].data.segment['sourceSegId'] = segmentId;
            }
            vm.annotations[annoIdx].data.segment.annotations = annotext;
            vm.annotations[annoIdx].save();
            $scope.sessionObj.save();
        }

        function playKeyDown(nokey) {
            if (vm.ffKeyDown) {return;}  // Block multiple keys
            vm.playKeyDown = true;
            vm.isPlaying = true;

            if (vm.regionMarked) {
                wsAnnotate.play(vm.playIn);
            } else {
                if (vm.curRegion > -1) {
                    playAudio(vm.selectedAnno,vm.curRegion);
                } else {
                    var thisTime = wsAnnotate.getCurrentTime();
                    makeNewRegion(thisTime);
                    vm.regionMarked = true;
                    vm.curRegion = vm.regionList.length - 1;
                    // no amount of deleting or setting to undefine in the delete last region function will work
                    vm.annoList.forEach(function(anno){
                        anno.annos[vm.curRegion] = '';
                    });
                    vm.playIn = thisTime;
                    $scope.$apply();
                    restoreFocus();
                    wsAnnotate.play();
                }
            }
            if (nokey) {$scope.$apply();}

        }
        vm.playDown = function() {
            playKeyDown(true);
        };
        function playKeyUp(nokey) {
            vm.playKeyDown = false;
            if (vm.ffKeyDown) {return;}  // Block multiple keys
            if (vm.regionMarked) {
                vm.isPlaying = false;
                wsAnnotate.pause();
            }
        }
        vm.playUp = function() {
            playKeyUp(true);
        };
        function ffKeyDown(nokey) {
            if (vm.playKeyDown) {return;}  // Block multiple keys
            vm.ffKeyDown = true;
            var thisTime = wsAnnotate.getCurrentTime();
            if (thisTime < vm.playIn) {
                var seeked = false;
                vm.regionList.every(function(reg, index) {
                    if (reg.start > thisTime) {
                        // we are now seeking to this region
                        seekToTime(reg.start);
                        vm.curRegion = index;
                        $timeout(function() {
                            $scope.$broadcast('inputfoo0');
                        }, 0);
                        seeked = true;
                        return false;
                    } else {return true;}
                });
                if (!seeked) {
                    vm.curRegion = -1;
                    seekToTime(vm.playIn+oneMillisecond);
                    seekToPlayin();
                }

            } else {
                if (vm.regionMarked) {
                    deleteLastRegion();
                    vm.curRegion = -1;
                }
                wsAnnotate.setPlaybackRate(ffPlaybackRate);
                wsAnnotate.play();
            }
            if (nokey) {$scope.$apply();}
        }

        function ffKeyUp(nokey) {
            vm.ffKeyDown = false;
            if (vm.playKeyDown) {return;}  // Block multiple keys
            if (wsAnnotate.isPlaying()) {
                wsAnnotate.pause();
                wsAnnotate.setPlaybackRate(1);
            }
        }

        function rwKey(nokey) {
            if (vm.regionMarked) {deleteLastRegion();}
            var thisTime = wsAnnotate.getCurrentTime();
            if ((thisTime - skipTimeValue) < vm.playIn) {
                if (vm.regionList.length) {
                    var lastidx = _.findLastIndex(vm.regionList, function (reg) {
                        if (reg.start < thisTime) {return true;}
                    });
                    if (lastidx > -1) {
                        seekToTime(vm.regionList[lastidx].start);
                        vm.curRegion = lastidx;
                        $timeout(function () {
                            $scope.$broadcast('inputfoo0');
                        }, 0);
                    }
                } else {
                seekToTime(0);
                }
            } else {
                wsAnnotate.skipBackward(skipTimeValue);
            }
            if (nokey) {$scope.$apply();}
        }

        function escKey(nokey) {
            deleteLastRegion();
        }

        function tabKey(nokey) {
            if (vm.childMode === 'respeak') {toggleRespeak();}
            if (vm.childMode === 'translate') {toggleTranslate();}
        }

        //
        // Set up Wavesurfer
        //
        function initialize() {
            wsAnnotate = WaveSurfer.create({
                backend: "WebAudio",
                container: "#annotatePlayback",
                normalize: true,
                hideScrollbar: false,
                scrollParent: true
            });

            /* Initialize the time line */
            timeline = Object.create(wsAnnotate.Timeline);
            timeline.init({
                wavesurfer: wsAnnotate,
                container: "#annotate-timeline"
            });
            /* Minimap plugin */
            miniMap = wsAnnotate.initMinimap({
                height: 40,
                waveColor: '#555',
                progressColor: '#999',
                cursorColor: '#999'
            });
            wsAnnotate.load($scope.audioSourceUrl);
            wsAnnotate.on('ready', function(){
                // this is a hack to resize the minimap when we resize wavesurfer, it depends on any-rezize-event.js
                var wavesurferelement = document.getElementById('annotatePlayback');
                wavesurferelement.addEventListener('onresize', _.debounce(function(){
                        miniMap.render();
                        miniMap.progress(miniMap.wavesurfer.backend.getPlayedPercents());
                    }, 25)
                );
                keyService.regKey(playKeyCode,'keydown', function() {playKeyDown(true);});
                keyService.regKey(playKeyCode,'keyup', function()   {playKeyUp(true);});
                keyService.regKey(ffKeyCode,'keydown',  function()  {ffKeyDown(true);});
                keyService.regKey(ffKeyCode,'keyup',    function()  {ffKeyUp(true);});
                keyService.regKey(rwKeyCode,'keydown',  function()  {rwKey(true);});
                keyService.regKey(escKeyCode,'keydown', function()  {escKey(true);});
                keyService.regKey(tabKeyCode,'keydown', function()  {tabKey(true);});
                initializeRegions();
            });
            wsAnnotate.on('region-in', function(reg) {
                // When are we going to PLAY into a region? or is it not just play?
                $scope.$apply();
            });
            wsAnnotate.on('region-out', function(reg) {
                // This will fire if we pause while doing the region-resize thing on play
                // vm.isPlaying = false if a playKeyUp event has occurred.
                // What other conditions will we play through a region?
                $scope.$apply();
            });
            wsAnnotate.on('audioprocess', function() {
                var currentPos = wsAnnotate.getCurrentTime();
                if (vm.regionMarked) {
                    _.last(vm.regionList).update({end: currentPos});
                }
            });
        }

        function restoreFocus() {

        }

        function makeNewRegion(starttime) {
            // this stuff just alternates which we use to colour when the region switches to record mode
            var colidx = 1;
            if (vm.regionList.length) {
                colidx = _.last(vm.regionList).data.colidx;
            } else {
                colidx = 1;
            }
            if (colidx === 0) {
                colidx = 1;
            } else {
                colidx = 0;
            }
            var col = {
                colidx: colidx
            };
            var hue = 90; // region is green for now
            var reg = wsAnnotate.addRegion({
                start: starttime,
                end: starttime,
                color: 'hsla('+hue+', 100%, 30%, 0.15)',
                drag: false,
                resize: false,
                data: col
            });
            vm.regionList.push(reg);
        }

        // delete the last audio, remove the wavesurfer region, seek to playIn, disable recording and make a new Segmap
        function deleteLastRegion() {
            var reg = vm.regionList.pop();
            reg.remove();
            vm.regionMarked = false;
            if (vm.regionList.length) {
                vm.playIn = _.last(vm.regionList).end;
            } else {
                vm.playIn = 0;
            }
            vm.curRegion = -1;
            vm.annoList[0].annos.pop();
        }

        //
        //
        // on navigating away, clean up the key events, wavesurfer instances and clear recorder data (it has no destroy method)
        $scope.$on('$destroy', function() {
            keyService.clearAll();
            timeline.destroy();
            wsAnnotate.destroy();
        });

        vm.selectedAnno = 0;
        vm.curRegion = -1;
        // used for guarding against multiple key presses
        vm.playKeyDown = false;
        vm.ffKeyDown = false;
        vm.regionList = [];
        vm.isPlaying = false;
        vm.regionMarked = false;
        // Playback object of objects for annotation playback preferences
        vm.activeTranslation = {};
        vm.activeRespeak = {};
        vm.sourcePlayback = {};
        vm.importedSegmentation = false; // for the respeak/translate import buttons

        vm.translations = $scope.secondaryList.filter(function(secData) { return secData.type === 'translate'; });
        vm.respeakings = $scope.secondaryList.filter(function(secData) { return secData.type === 'respeak'; });
        console.log($scope.annotationObjList);

        vm.annotations = $scope.annotationObjList;
        // Enable playback for all source audio files for each annotation
        // This allows for preferences depending on the annotation
        vm.annotations.forEach(function(annodata, aidx){
            vm.activeTranslation[annodata.data._ID] = {};
            vm.activeRespeak[annodata.data._ID] = {};
            vm.sourcePlayback[aidx] = true;
            vm.respeakings.forEach(function(fitem,idx){
                vm.activeRespeak[annodata.data._ID][idx] = true;
            });
            vm.translations.forEach(function(fitem,idx){
                vm.activeTranslation[annodata.data._ID][idx] = true;
            });
        });

        vm.loop = {};

        //
        // FUNCTIONS BOUND TO VIEW MODEL
        //
        vm.selectAnno = function(annoIdx) {
            vm.selectedAnno = annoIdx;
        };
        vm.openMenu = function($mdOpenMenu, ev) {
            $mdOpenMenu(ev);
        };
        vm.toggleRespeaking = function(aidx, ridx) {
            vm.activeRespeak[aidx][ridx] = !vm.activeRespeak[aidx][ridx] ;
            restoreFocus();
        };
        
        vm.isRspkActive = function(aidx, ridx) {
            return vm.activeRespeak[aidx][ridx];
        };
        
        vm.toggleTranslation = function(aidx, ridx) {
            vm.activeTranslation[aidx][ridx] = !vm.activeTranslation[aidx][ridx];
            restoreFocus();
        };
        vm.isTransActive = function(aidx, ridx) {
            return vm.activeTranslation[aidx][ridx];
        };

        vm.toggleSourcePlayback = function(idx) {
            vm.sourcePlayback[idx] = !vm.sourcePlayback[idx];
            restoreFocus();
        };
        vm.toggleLoopPlayback = function(idx) {
            vm.annoList[idx].loop = !vm.annoList[idx].loop;
            restoreFocus();
        };


        vm.toggleChildMode = function() {
            if (vm.childMode === 'respeak') {
                vm.childMode = 'translate';
                restoreFocus();
                return;
            }
            if (vm.childMode === 'translate') {
                vm.childMode = 'respeak';
                restoreFocus();
                return;
            }
        };
        vm.selectRespeak = function() {
            
        };
        vm.selectTranslate = function() {

        };
        vm.inputReturn = function(annoIdx) {
            if (vm.regionMarked) {
                markLastRegionComplete();
                vm.regionMarked = false;
                vm.curRegion = -1;
            } else {
                if (vm.curRegion === (vm.regionList.length -1)) {
                    seekToTime(vm.regionList[vm.curRegion].end + 0.001);
                    vm.curRegion = -1;
                } else {
                    ++vm.curRegion;
                    vm.seekRegion(vm.curRegion);
                }
            }
            saveAnnotation(annoIdx);
        };
        vm.seekRegion = function(idx) {
            if (vm.regionMarked) {
                deleteLastRegion();
                vm.curRegion = -1;
            }
            seekToTime(vm.regionList[idx].start);
            vm.curRegion = idx;
            vm.regionList[idx].play();
            $timeout(function() {
                $scope.$broadcast('inputfoo0');
            }, 0);
        };
        vm.help = function(ev) {
            aikumaDialog.help(ev, 'annotate');
        };


        vm.useRspkTrans = function(ev, type) {
            if (hasAnnotations()) {
                $translate(['ANNO_EXIST', 'ANNO_DELCONF1', 'ANNO_DELCONF2', 'ANNO_DELNO', 'USE_RSPK', 'USE_TRANS']).then(function (translations) {
                    var okaytext;
                    switch(type) {
                        case 'respeak':
                            okaytext = translations.USE_RSPK;
                            break;
                        case 'translate':
                            okaytext = translations.USE_TRANS;
                            break;
                    }
                    var confirm = $mdDialog.confirm()
                        .title(translations.ANNO_EXIST)
                        .textContent(translations.ANNO_DELCONF1)
                        .ariaLabel('Delete annotations')
                        .targetEvent(ev)
                        .ok(okaytext)
                        .cancel(translations.ANNO_DELNO);
                    $mdDialog.show(confirm).then(function() {
                        // User has agreed. Make wavesurfer regions
                        // Assuming successful, set current region to start, set playIn to the end of the last region
                        // Set focus on the appropriate annotation
                        // and play the region
                        vm.importedSegmentation = true; // for disabling buttons
                        
                        if (type === 'respeak') {makeWSRegions(vm.rSeg);}
                        if (type === 'translate') {makeWSRegions(vm.tSeg);}
                        if (vm.regionList.length) {
                            vm.curRegion = 0;
                            vm.playIn = _.last(vm.regionList).end;
                            restoreFocus();
                            playAudio(vm.selectedAnno,vm.curRegion);
                        } else {
                            vm.curRegion = -1;
                        }
                    }, function() {

                    });

                });

            }
        };

        //
        //
        //
        initialize();


    };
    annotationController.$inject = ['$scope', 'keyService', 'aikumaService', '$timeout', '$mdDialog', 'aikumaDialog', '$translate'];

})();