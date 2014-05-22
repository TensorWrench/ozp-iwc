var FakePeer=function() {
	this.events=new ozpIwc.Event();
		
	this.events.mixinOnOff(this);
		
	this.packets=[];
	this.send=function(packet) {
		this.packets.push(packet);
	};
};

var clockOffset=0;

var tick=function(t) { 
	clockOffset+=t;
	try {
		jasmine.clock().tick(t);
	} catch (e) {
		// do nothing
	}
};

// mock out the now function to let us fast forward time
ozpIwc.util.now=function() {
	return new Date().getTime() + clockOffset;
};
	
var TestParticipant=ozpIwc.util.extend(ozpIwc.Participant,function(config) {
	ozpIwc.Participant.apply(this,arguments);
	this.origin=config.origin || "foo.com";
	
	this.packets=[];
	this.messageId=1;
	this.callbacks={};
	this.connect=function(router) {
		router.registerParticipant(this);
	};
	
	if(config.router) {
		this.connect(config.router);
	}
	
	this.receiveFromRouter=function(packet){ 
		if(this.callbacks[packet.replyTo]) {
			this.callbacks[packet.replyTo](packet);
		}
		this.packets.push(packet); 
		return true;
	};

	this.send=function(packet,callback) {
		packet.ver=packet.ver || 1;
		packet.src=packet.src || this.address;
		packet.dst=packet.dst || config.dst;
		packet.msgId= packet.msgId || this.messageId++;
		packet.time=packet.time || new Date().getTime();

		if(callback) {
			this.callbacks[packet.msgId]=callback;
		}
		this.router.send(packet,this);
		return packet;
	};
	
	this.reply=function(originalPacket,packet,callback) {
		packet.ver=packet.ver || originalPacket.ver || 1;
		packet.src=packet.src || originalPacket.dst || this.address;
		packet.dst=packet.dst || originalPacket.src || config.dst;
		packet.msgId= packet.msgId || this.messageId++;
		packet.time=packet.time || new Date().getTime();
		
		packet.replyTo=originalPacket.msgId;

		packet.action=packet.action || originalPacket.action;
		packet.resource=packet.resource || originalPacket.resource;

		if(callback) {
			this.callbacks[packet.msgId]=callback;
		}
		this.router.send(packet,this);
		return packet;	
	};
});