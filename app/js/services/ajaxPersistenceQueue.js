ozpIwc.AjaxPersistenceQueue=function(config) {
    config=config || {};
    this.poolSize=config.poolSize || 4;
    
    this.syncPool=[]; // The tail of the promise chain for each pool
    
    // populate the slots with resolved promises
    for(var i=0; i< this.poolSize; ++i) {
        this.syncPool.push(Promise.resolve());
    }

    // a counter that round-robins the requests to persist among the slots
    this.nextSlot=0;

    // maps the iwcUri to the promise that is saving it
    this.queuedSyncs={};
};

ozpIwc.AjaxPersistenceQueue.prototype.doSync=function(iwcUri,node) {
    if(node.deleted) {
       return ozpIwc.util.ajax({
            href:  node.self,
            method: 'DELETE'
        });        
    } else {
        var entity=node.serializedEntity();
        if(typeof(entity) !== "string") {
            entity=JSON.stringify(entity);
        }
        ozpIwc.log.debug("PUT " + node.self,entity);
        return ozpIwc.util.ajax({
            href:  node.self,
            method: 'PUT',
            data: entity,
            headers: {
                "Content-Type": node.serializedContentType()
            }
        }).then(function(result) {
            ozpIwc.log.debug("  saving to " + node.self,result);
        },function(error) {
            ozpIwc.log.error("  FAILED saving to " + node.self,error);
        });
    }
}; 

// FIXME: it's possible to have poolSize updates in flight for a rapidly changing node when the pool is lightly utilized.
// The duplicate call will occur when all of these conditions are met:
//   * An ajax request for the node is still active.
//   * queueNode(n) is called
//   * the new sync promise reaches the head of its pool queue
// Example with poolSize=3 and node "n"
//   queueNode(n) -> assigns n to pool 1
//      pool 1 -> starts AJAX call and clears queuedSyncs[n]
//   queueNode(n) -> n is not queued, so assigns n to pool 2
//      pool 2 -> starts AJAX call and clears queuedSyncs[n]
//   queueNode(n) -> n is not queued, so assigns n to pool 3
//      pool 3 -> starts AJAX call and clears queuedSyncs[n]
ozpIwc.AjaxPersistenceQueue.prototype.queueNode=function(iwcUri,node) {
    var self=this;
    // the value of node is captured immediately before it is saved to the backend
    // only add it to the queue if it isn't already there
    if(!this.queuedSyncs[iwcUri]) {
        // round robin between slots
        this.nextSlot=(this.nextSlot+1) % this.poolSize;
        
        // chain off the syncPool, update the sync pool tail,
        // and save it for the iwcUri for this node        
        this.syncPool[this.nextSlot]= this.queuedSyncs[iwcUri]=
            this.syncPool[this.nextSlot].then(function() {
                // since doSync serializes the node, remove it from the queue now
                // to capture post-serialization changes
                delete self.queuedSyncs[iwcUri];
                return self.doSync(iwcUri,node);
            });
    }
    return this.queuedSyncs[iwcUri];
};
