/*
 * @method ozpIwc.ApiPromiseMixin
 * @static
 * Augments a participant or connection that supports basic IWC communications
 * functions for sending and receiving.
 * @uses ozpIwc.Events
 * @param {ozpIwc.Participant} participant
 */
ozpIwc.ApiPromiseMixin=function(participant,autoConnect) {
    autoConnect = (typeof autoConnect === "undefined" || autoConnect);

    participant.address = participant.address || "$nobody";
    participant.connect = participant.connect ||  function(){
        participant.connectPromise = Promise.resolve();

        return participant.connectPromise;
    };

    if(!participant.events) {
        participant.events = new ozpIwc.Event();
        participant.events.mixinOnOff(participant);
    }

    var mixins = ozpIwc.ApiPromiseMixin.getCore();
    for(var i in mixins){
        participant[i] = mixins[i];
    }

    participant.readLaunchParams(window.name);
    participant.readLaunchParams(window.location.search);
    participant.readLaunchParams(window.location.hash);

    ozpIwc.ApiPromiseMixin.registerEvents(participant);

    participant.constructApiFunctions();

    if(autoConnect){
        participant.connect();
    }
};

/**
 * Registers event listeners for the participant.  Listens for the following events: disconnect.
 * @method registerEvents
 * @static
 * @param {ozpIwc.Participant} participant
 */
ozpIwc.ApiPromiseMixin.registerEvents = function(participant){
    participant.on("disconnect",function(){
        participant.promiseCallbacks={};
        participant.registeredCallbacks={};
        window.removeEventListener("message",participant.postMessageHandler,false);
        participant.connectPromise = null;
    });
};

/**
 * A factory for the apiPromise functionality.
 *
 * @method getCore
 * @static
 * @returns {Object}
 */
ozpIwc.ApiPromiseMixin.getCore = function() {
    return {

        /**
         * @property promiseCallbacks
         * @type Object
         * @default {}
         */
        promiseCallbacks: {},

        /**
         * @property msgIdSequence
         * @type Number
         * @default 0
         */
        msgIdSequence: 0,

        /**
         * @property receivedPackets
         * @type Number
         * @default 0
         */
        receivedPackets: 0,

        /**
         * @property receivedBytes
         * @type Number
         * @default 0
         */
        receivedBytes: 0,

        /**
         * @property sentPackets
         * @type Number
         * @default 0
         */
        sentPackets: 0,

        /**
         * @property sentBytes
         * @type Number
         * @default 0
         */
        sentBytes: 0,

        /**
         * The epoch time the Client was instantiated.
         * @property startTime
         * @type Number
         */
        startTime: ozpIwc.util.now(),

        /**
         * A map of available apis and their actions.
         * @property apiMap
         * @type Object
         */
        apiMap: ozpIwc.apiMap || {},

        /**
         * @property wrapperMap
         * @type Object
         * @default {}
         */
        wrapperMap: {},

        /**
         * @property preconnectionQueue
         * @type Array
         * @default []
         */
        preconnectionQueue: [],

        /**
         * @property launchParams
         * @type Object
         * @default {}
         */
        launchParams: {},

        /**
         * @property watchMsgMap
         * @type Object
         * @default {}
         */
        watchMsgMap: {},

        /**
         * @property registeredCallbacks
         * @type Object
         * @default {}
         */
        registeredCallbacks: {},

        /**
         * @property launchedIntents
         * @type Array
         * @default []
         */
        launchedIntents: [],

        /**
         * Returns whether or not the participant is connected to the IWC bus.
         *
         * @method isConnected
         * @returns {Boolean}
         */
        isConnected: function(){
            return this.address !== "$nobody";
        },

        /**
         * Parses launch parameters based on the raw string input it receives.
         *
         * @method readLaunchParams
         * @param {String} rawString
         */
        readLaunchParams: function(rawString) {
            // of the form ozpIwc.VARIABLE=VALUE, where:
            //   VARIABLE is alphanumeric + "_"
            //   VALUE does not contain & or #
            var re=/ozpIwc.(\w+)=([^&#]+)/g;
            var m;
            while((m=re.exec(rawString)) !== null) {
                var params = decodeURIComponent(m[2]);
                try{
                    params = JSON.parse(params);
                } catch(e){
                    // ignore the errors and just pass through the string
                }
                this.launchParams[m[1]]=params;
            }
        },

        /**
         * Receive a packet from the connected peer.  If the packet is a reply, then
         * the callback for that reply is invoked.  Otherwise, it fires a receive event
         *
         * Fires:
         *     - {{#crossLink "ozpIwc.Client/receive:event}}{{/crossLink}}
         *
         * @method receive
         * @protected
         * @param {ozpIwc.TransportPacket} packetContext
         */
        receiveFromRouterImpl: function (packetContext) {
            var handled = false;

            // If no packet, it is likely a $transport packet.
            var packet = packetContext.packet || packetContext;
            //Try and handle this packet as a reply message
            if (packet.src ==="$transport" || packet.replyTo && this.promiseCallbacks[packet.replyTo]) {

                var replyCancel = false;
                var replyDone = function () {
                    replyCancel = true;
                };
                this.promiseCallbacks[packet.replyTo](packet, replyDone);

                if (replyCancel) {
                    this.cancelPromiseCallback(packet.replyTo);
                    handled = true;
                }

            }

            //Try and handle this packet as callback message
            if (!handled && packet.replyTo && this.registeredCallbacks[packet.replyTo]) {

                var registeredCancel = false;
                var registeredDone = function () {
                    registeredCancel = true;
                };

                handled = this.registeredCallbacks[packet.replyTo](packet, registeredDone);
                if (registeredCancel) {
                    if (this.watchMsgMap[packet.replyTo] && this.watchMsgMap[packet.replyTo].action === "watch") {
                        this.api(this.watchMsgMap[packet.replyTo].dst).unwatch(this.watchMsgMap[packet.replyTo].resource);
                    }
                    this.cancelRegisteredCallback(packet.replyTo);
                }
            }
            if(!handled){
                // Otherwise trigger "receive" for someone to handle it
                this.events.trigger("receive",packetContext);
            }
        },

        /**
         * Builds the client api calls from the values in client.apiMap
         *
         * @method constructApiFunctions
         */
        constructApiFunctions: function () {
            for (var api in this.apiMap) {
                var apiObj = this.apiMap[api];
                var apiFuncName = apiObj.address.replace('.api', '');

                //prevent overriding client constructed fields, but allow updating of constructed APIs
                if (!this.hasOwnProperty(apiFuncName) || this.apiMap[api].functionName === apiFuncName) {
                    // wrap this in a function to break the closure
                    // on apiObj.address that would otherwise register
                    // everything for the last api in the list
                    /*jshint loopfunc:true*/
                    (function (self, addr) {
                        self[apiFuncName] = function () {
                            return self.api(addr);
                        };
                        self.apiMap[addr] = self.apiMap[addr] || {};
                        self.apiMap[addr].functionName = apiFuncName;
                        self.updateApi(addr);
                    })(this, apiObj.address);
                }
            }
        },

        /**
         * Calls the names.api to gather the /api/* resources to gain knowledge of available api actions of the current bus.
         *
         * @method gatherApiInformation
         * @returns {Promise}
         */
        gatherApiInformation: function () {
            var self = this;
            // gather api information
            return this.send({
                dst: "names.api",
                action: "get",
                resource: "/api"
            }).then(function (reply) {
                if (reply.response === 'ok') {
                    return reply.entity;
                } else {
                    throw reply.response;
                }
            }).then(function (apis) {
                var promiseArray = [];
                apis.forEach(function (api) {
                    var promise = self.send({
                        dst: "names.api",
                        action: "get",
                        resource: api
                    }).then(function (res) {
                        if (res.response === 'ok') {
                            var name = api.replace('/api/', '');
                            self.apiMap[name] = self.apiMap[name] || {};
                            self.apiMap[name].address = name;
                            self.apiMap[name].actions = res.entity.actions;
                        } else {
                            throw res.response;
                        }
                    });
                    promiseArray.push(promise);
                });
                return Promise.all(promiseArray);
            });
        },

        /**
         * Cancel a reply callback registration.
         * @method cancelPromiseCallback
         * @param (String} msgId The packet replyTo ID for which the callback was registered.
         *
         * @return {Boolean} True if the cancel was successful, otherwise false.
         */
        cancelPromiseCallback: function (msgId) {
            var success = false;
            if (msgId) {
                delete this.promiseCallbacks[msgId];
                success = true;
            }
            return success;
        },

        /**
         * Cancel a watch callback registration.
         *
         * @method cancelRegisteredCallback
         * @param (String} msgId The packet replyTo ID for which the callback was registered.
         *
         * @return {Boolean} True if the cancel was successful, otherwise false.
         */
        cancelRegisteredCallback: function (msgId) {
            var success = false;
            if (msgId) {
                delete this.registeredCallbacks[msgId];
                delete this.watchMsgMap[msgId];
                success = true;
            }
            return success;
        },

        /**
         * Registers callbacks
         *
         * @method on
         * @param {String} event The event to call the callback on.
         * @param {Function} callback The function to be called.
         *
         */
        on: function (event, callback) {
            if (event === "connected" && this.isConnected()) {
                callback(this);
                return;
            }
            return this.events.on.apply(this.events, arguments);
        },

        /**
         * De-registers callbacks
         *
         * @method off
         * @param {String} event The event to call the callback on.
         * @param {Function} callback The function to be called.
         *
         */
        off: function (event, callback) {
            return this.events.off.apply(this.events, arguments);
        },

        /**
         * Handles intent invocation packets. Communicates back with the intents.api to operate the in flight intent state
         * machine.
         *
         * @method intentInvocationHandling
         * @param resource {String} The resource of the packet that sent the intent invocation
         * @param inFlightIntent {Object} The in flight intent, used internally to operate the in flight intent state machine
         * @param callback {Function} The intent handler's callback function
         * @returns {Promise}
         */
        intentInvocationHandling: function (packet, inFlightIntent, callback) {
            var self = this;
            var res;
            var promiseChain;
            callback = callback || function(){};
            inFlightIntent = inFlightIntent || {};
            if(inFlightIntent.entity) {
                promiseChain = Promise.resolve(inFlightIntent);
            } else {
                promiseChain = self.send({
                    dst: "intents.api",
                    action: "get",
                    resource: inFlightIntent.resource
                });
            }
            return promiseChain.then(function(inFlightIntentRes) {
                res = inFlightIntentRes;
                return self.send({
                    dst: "intents.api",
                    contentType: res.contentType,
                    action: "set",
                    resource: res.resource,
                    entity: {
                        handler: {
                            resource: packet.resource,
                            address: self.address
                        },
                        state: "running"
                    }
                });
            }).then(function(){
                // Run the intent handler. Wrapped in a promise chain in case the callback itself is async.
                return callback(res.entity);
            }).then(function (result) {

                // Respond to the inflight resource
                return self.send({
                    dst: "intents.api",
                    contentType: res.contentType,
                    action: "set",
                    resource: res.resource,
                    entity: {
                        reply: {
                            'entity': result || {},
                            'contentType': res.entity.intent.type
                        },
                        state: "complete"
                    }
                });
            })['catch'](function(e){
                ozpIwc.log.error("Error in handling intent: ", e, " -- Reporting error on in-flight intent node:",
                    res.resource);
                // Respond to the inflight resource
                return self.send({
                    dst: "intents.api",
                    contentType: res.contentType,
                    action: "set",
                    resource: res.resource,
                    entity: {
                        reply: {
                            'entity': e || {},
                            'contentType': res.entity.intent.type
                        },
                        state: "error"
                    }
                });
            });
        },

        /**
         * Calls the specific api wrapper given an api name specified.
         * If the wrapper does not exist it is created.
         *
         * @method api
         * @param apiName {String} The name of the api.
         * @returns {Function} returns the wrapper call for the given api.
         */
        api: function (apiName) {
            return this.wrapperMap[apiName] || this.updateApi(apiName);
        },
        /**
         * Updates the wrapper map for api use. Whenever functionality is added or removed from the apiMap the
         * updateApi must be called to reflect said changes on the wrapper map.
         *
         * @method updateApi
         * @param apiName {String} The name of the api
         * @returns {Function} returns the wrapper call for the given api.
         */
        updateApi: function (apiName) {

            /**
             * Function generator. Generates API functions given a messageBuilder function.
             * @method augment
             * @param messageBuilder
             * @param client
             * @returns {Function}
             */
            var augment = function (messageBuilder,client) {
                return function (resource, fragment, otherCallback) {
                    var message = messageBuilder(resource,fragment,otherCallback);
                    var packet = message.packet;


                    if (packet.dst === "intents.api" && packet.action === "register") {
                        for (var i in client.launchedIntents) {
                            var loadedResource = '/' + client.launchedIntents[i].entity.intent.type + '/' + client.launchedIntents[i].entity.intent.action;
                            if (resource === loadedResource) {
                                client.intentInvocationHandling(packet, client.launchedIntents[i].resource, message.callback);
                                delete client.launchedIntents[i];
                            }
                        }
                    }
                    return client.send(packet, message.callback);
                };
            };

            /**
             * Function generator. Generates API message formatting functions for a client-destination-action pairing.
             * These are generated for bulk sending capabilities, since the message needs to be formatted but not
             * transmitted until desired.
             *
             * @method messageBuilderAugment
             * @param dst
             * @param action
             * @param client
             * @returns {Function}
             */
            var messageBuilderAugment = function(dst, action, client) {
                return function (resource, fragment, otherCallback) {
                    // If a fragment isn't supplied argument #2 should be a callback (if supplied)
                    if (typeof fragment === "function") {
                        otherCallback = fragment;
                        fragment = {};
                    }
                    var packet = {
                        'dst': dst,
                        'action': action,
                        'resource': resource,
                        'entity': {}
                    };
                    for (var k in fragment) {
                        packet[k] = fragment[k];
                    }
                    var resolve,reject;
                    var sendData = new Promise(function(res,rej){
                        resolve = res;
                        reject = rej;
                    });

                    sendData.packet = client.fixPacket(packet);
                    sendData.callback = otherCallback;
                    sendData.res = resolve;
                    sendData.rej = reject;
                    return sendData;
                };
            };

            var wrapper = this.wrapperMap[apiName] || {};
            if (this.apiMap.hasOwnProperty(apiName)) {
                var api = this.apiMap[apiName];
                wrapper = {};

                /**
                 *  All message formatting calls sits inside the API wrapper's messageBuilder object. These
                 *  calls will return a formatted message ready to be sent.
                 *  (e.g: data().messageBuilder.set)
                 */
                wrapper.messageBuilder = {};
                wrapper.messageBuilder.bulkSend = function (messages, otherCallback) {
                    var packet = {
                        'dst': api.address,
                        'action': "bulkSend",
                        'resource': "/",
                        'entity': messages
                    };

                    return {
                        'packet': packet,
                        'callback': otherCallback
                    };
                };

                /**
                 * All function calls are on the root level of the API wrapper. These calls will format messages and
                 * then send them to the router.
                 * (e.g: data().set)
                 */
                wrapper.bulkSend = (function (bulkMessageBuilder, client) {
                    return function (messages) {
                        var message = bulkMessageBuilder(messages);
                        return client.send(message.packet, message.callback);
                    };
                })(wrapper.messageBuilder.bulkSend, this);

                /**
                 * Iterate over all mapped function calls and augment their message formatter and function call.
                 */
                for (var i = 0; i < api.actions.length; ++i) {
                    var action = api.actions[i];
                    wrapper.messageBuilder[action] = messageBuilderAugment(api.address, action, this);
                    wrapper[action] = augment(wrapper.messageBuilder[action],this);
                }

                this.wrapperMap[apiName] = wrapper;
            }
            wrapper.apiName = apiName;
            return wrapper;
        },

        /**
         * Applies necessary properties to the packet to be transmitted through the router.
         *
         * @method fixPacket
         * @param {Object} fields
         * @returns {Object}
         */
        fixPacket : function(fields){
            var packet = {
                ver: 1,
                src: fields.src || this.address,
                msgId: fields.msgId || "p:" + this.msgIdSequence++,
                time: fields.time || new Date().getTime()
            };

            for (var k in fields) {
                packet[k] = fields[k] || packet[k];
            }

            if(packet.src === "$nobody") {
                packet.src = this.address;
            }

            return packet;
        },

        /**
         * Registers callbacks for API request callbacks and promises.
         *
         * @method registerResponses
         * @property {Object} packet
         * @property {Function} callback
         * @property {Function} promiseRes
         * @property {Function} promiseRej
         */
        registerResponses: function(packet,callback,promiseRes,promiseRej){
            var self = this;
            if (callback) {
                this.registeredCallbacks[packet.msgId] = function (reply, done) {
                    // We've received a message that was a promise response but we've aready handled our promise response.
                    if (reply.src === "$transport" || /(ok).*/.test(reply.response) || /(bad|no).*/.test(reply.response)) {
                        // Do noting and let it get sent to the event handler
                        return false;
                    }else if (reply.entity && reply.entity.inFlightIntent) {
                        self.intentInvocationHandling(packet, reply.entity.inFlightIntent, callback);
                    } else {
                        callback(reply, done);
                    }
                    return true;
                };
            }

            //respondOn "all", "error", or no value (default all) will register a promise callback.
            if(packet.respondOn !== "none") {
                this.promiseCallbacks[packet.msgId] = function (reply, done) {
                    if (reply.src === "$transport" || /(ok).*/.test(reply.response)) {
                        done();
                        promiseRes(reply);
                    } else if (/(bad|no).*/.test(reply.response)) {
                        done();
                        promiseRej(reply);
                    } else {
                        // it was not a promise callback
                    }
                };
            }

            if (packet.action === "watch") {
                this.watchMsgMap[packet.msgId] = packet;
            } else if (packet.action === "unwatch" && packet.replyTo) {
                this.cancelRegisteredCallback(packet.replyTo);
            }

            if(packet.action === "bulkSend"){
                packet.entity.forEach(function(message) {
                    self.registerResponses(message.packet, message.callback, message.res, message.rej);
                });
            }
        },
        /**
         * Sends a packet through the IWC.
         * Will call the participants sendImpl function.
         *
         * @method send
         * @param {Object} fields properties of the send packet..
         * @param {Function} callback The Callback for any replies. The callback will be persisted if it returns a truth-like
         * @param {Function} preexistingPromiseRes If this send already has a promise resolve registration, use it rather than make a new one.
         * @param {Function} preexistingPromiseRej If this send already has a promise reject registration, use it rather than make a new one.
         * value, canceled if it returns a false-like value.
         */
        send: function (fields, callback, preexistingPromiseRes, preexistingPromiseRej) {
            if(this.sendingBlocked) {
                return Promise.resolve({response: "dropped"});
            }
            var promiseRes = preexistingPromiseRes;
            var promiseRej = preexistingPromiseRej;
            var promise = new Promise(function (resolve, reject) {

                if (!promiseRes && !promiseRej) {
                    promiseRes = resolve;
                    promiseRej = reject;
                }
            });

            if (!(this.isConnected() || fields.dst === "$transport")) {
                // when send is switched to promises, create the promise first and return it here, as well
                this.preconnectionQueue.push({
                    'fields': fields,
                    'callback': callback,
                    'promiseRes': promiseRes,
                    'promiseRej': promiseRej
                });
                return promise;
            }
            var packet = this.fixPacket(fields);
            this.registerResponses(packet,callback,promiseRes,promiseRej);
            this.sendImpl(packet);
            this.sentBytes += packet.length;
            this.sentPackets++;

            return promise;
        },

        /**
         * Generic handler for a bus connection to handle any queued messages & launch data after its connected.
         * @method afterConnected
         * @returns {Promise}
         */
        afterConnected: function(){
            var self = this;
            // dump any queued sends, trigger that we are fully connected
            self.preconnectionQueue.forEach(function (p) {
                self.send(p.fields, p.callback, p.promiseRes, p.promiseRej);
            });
            self.preconnectionQueue = [];
            if (!self.launchParams.inFlightIntent || self.internal) {
                self.events.trigger("connected");
                return Promise.resolve();
            }

            // fetch the inFlightIntent
            return self.intents().get(self.launchParams.inFlightIntent).then(function (response) {
                // If there is an inflight intent that has not already been handled (i.e. page refresh driving to here)
                if (response && response.entity && response.entity.intent) {
                    self.launchedIntents.push(response);
                    var launchData = response.entity.entity || {};
                    if (response.response === 'ok') {
                        for (var k in launchData) {
                            self.launchParams[k] = launchData[k];
                        }
                    }
                    self.intents().set(self.launchParams.inFlightIntent, {
                        entity: {
                            state: "complete"
                        }
                    });
                }
                self.events.trigger("connected");
            })['catch'](function(e){
                ozpIwc.log.error(self.launchParams.inFlightIntent, " not handled, reason: ", e);
                self.events.trigger("connected");
            });
        }

    };
};