describe('aikuma-viewcontrollers', function(){
    var $controller,
        $q,
        $httpBackend;
    
    module.sharedInjector();
    
    
    beforeAll(module(
            'aikuma',
            'pascalprecht.translate',  // AKA angular translate
            'aikuma-dataservice'       // data service dealing with metadata and files
    ));
    
    beforeAll(module(function($provide) {
        $provide.constant('config', {
            
        });
    }));
    
    beforeAll(inject(function(_$q_, _$httpBackend_) {
        $q = _$q_;
        $httpBackend = _$httpBackend_;
        
        $httpBackend.whenGET('languages/en.json').respond({});
        $httpBackend.whenGET('views/home.html').respond('');
    }));

    
    describe('aikumaUtils', function() {
        
        it('util function test', inject(function(aikumaUtils) {
            var alpha = aikumaUtils.createRandomAlphabets(8);
            var num = aikumaUtils.createRandomNumbers(8);
            
            expect(alpha).toEqual(jasmine.stringMatching(/[A-Z]{8}/));
            expect(num).toEqual(jasmine.stringMatching(/[0-9]{8}/));
            
        }));
    });

    
    describe('dataService', function() {
        var dataService;
        var userId, sessionId, secondaryId;
        var originalTimeout;
        
        beforeAll(inject(function(_dataService_) {
            dataService = _dataService_;  
        }));
        
        it('setUser(data): create a new user', function(done) {
            // Three essential fields for userData
            var mockUserData = {
                names: ['Mat Bettinson', '茂修'],
                email: 'foo@gmail.com',
                preferences: {
                    langCode: 'en'
                }
            };
            
            dataService.setUser(mockUserData).then(function(id) {
                userId = id[0];
                dataService.get('user', userId).then(function(userObj) {
                    expect(mockUserData).toEqual(userObj.data);  
                    done();
                })
            });
        });
        
        it('setSession(userId, data): creates a new session under userId', function(done) {
            // 3 essential fields for sessionData
            var mockSessionData = {
                names: ['The Rotunda Conversation'],
                source: {
                    // This is an ID of source file in userData.files
                    recordFileId: '1',
                    created: 1463318114309,
                    duration: 1621,
                    langIds: [
                        {
                            langStr: 'English',
                            langISO: 'eng'
                        }
                    ]
                },
                creatorId: userId
            };
            
            dataService.setSession(userId, mockSessionData).then(function(id) {
                sessionId = id[0];
                dataService.get('session', sessionId).then(function(sessionObj){
                    expect(mockSessionData).toEqual(sessionObj.data);
                    done();
                })
            });
            
        });
        
        it('setSecondary(userId, sessionId, data): creates a new secondary(annotation/translation) under userId and sessionId', function(done){
            // 5 essential fields for sessionData
            var mockSecondaryData = {
                names: ['Respeak 1'],
                type: 'respeak',
                source: {
                    // This is an ID of source file in userData.files
                    recordFileId: '2',
                    created: 1459400284491,
                    duration: 2218,
                    langIds: [
                        {
                            langStr: 'English', langISO: 'eng'
                        }
                    ],
                    sampleRate: 48000,
                    sampleLength: 106496
                },
                creatorId: userId,
                segment: {
                    // This is an ID of source segment in sessionData.segments
                    sourceSegId: '1',
                    segMsec: [
                        [0, 1024], [1024, 2219]
                    ],
                    segSample: [
                        [0, 49151], [49151, 106495]
                    ]
                }
            };
            
            dataService.setSecondary(userId, sessionId, mockSecondaryData).then(function(id){
                secondaryId = id[0];
                dataService.get('secondary', secondaryId).then(function(secondaryObj) {
                    expect(mockSecondaryData).toEqual(secondaryObj.data);
                    done();
                })
            });
            
        });
        
        
        afterAll(function(done) {
            dataService.clear().then(function(){
                console.log('DB is cleaned');
                done();
            });
        })
        
    })
    

    
});