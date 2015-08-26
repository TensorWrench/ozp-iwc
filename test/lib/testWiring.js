
jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
// Clear out the window.name in case it's left over from previous failed tests
window.name = "";

var ozpIwc = ozpIwc || {};
ozpIwc.enableDefault = false;

ozpIwc.log.setThreshold(ozpIwc.log.ALL);

ozpIwc.defaultPeer = new ozpIwc.Peer();
ozpIwc.defaultRouter = new ozpIwc.Router({
    peer: ozpIwc.defaultPeer,
    heartbeatFrequency: 99999999
});


// All unit tests need to fake out the clock
var now = function() {
    return Date.now();
};
var start;
beforeEach(function() {
    start = now();
    jasmine.clock().install();
});
afterEach(function() {
    jasmine.clock().uninstall();
    ozpIwc.object.eachEntry(ozpIwc.util.eventListeners, function(type, listenerList) {
        if (listenerList.length) {
            console.log("Dangling listeners on " + type, listenerList);
        }
    });
    ozpIwc.util.purgeEventListeners();
    expect(now() - start).toBeLessThan(15000);
});