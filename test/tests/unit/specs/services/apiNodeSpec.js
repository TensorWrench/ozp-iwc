describe("ApiNode",function() {
	var apiNode;
    beforeEach(function() {
       apiNode=new ozpIwc.ApiNode({
            resource: "/foo",
            version: 50,        
            self: "https://example.com/iwc/foo",
            contentType: "text/plain",
            entity: "hello world"
       });
	});
    
    it("fails if constructed without a resource",function() {
        expect(function() {
            new ozpIwc.ApiNode();
        }).toThrow();
    });
    it("deserializes and serializes live data with the same outcome",function() {
        var serialized=apiNode.serializeLive();
        var node2=new ozpIwc.ApiNode({resource:"/foo"});
        node2.deserializeLive(serialized);
        expect(node2).toEqual(apiNode);     
    });
    
    it("a set with etag properly updates the version",function() {
        apiNode.set({
           entity: "goodbye world",
           eTag: 100
        });
        expect(apiNode.entity).toEqual("goodbye world");
        expect(apiNode.version).toEqual(100);
    });
    
    it("deserializes and serializes persisted data with the same outcome",function() {
        var node2=new ozpIwc.ApiNode({resource:"/foo"});
        node2.deserializedEntity(apiNode.serializedEntity(),apiNode.serializedContentType());
        expect(node2).toEqual(apiNode);
    });
    
    it("deserializes and serializes persisted data with the same outcome using the constructor",function() {
        var node2=new ozpIwc.ApiNode({
            serializedEntity: apiNode.serializedEntity(),
            serializedContentType: apiNode.serializedContentType()
        });
        expect(node2).toEqual(apiNode);
    });
    
    it("deserializes and serializes persisted data with the same outcome using the constructor without content type",function() {
        var node2=new ozpIwc.ApiNode({
            serializedEntity: apiNode.serializedEntity()
        });
        expect(node2).toEqual(apiNode);
    });
    
});