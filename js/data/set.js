var dataApi = client.data();

var foo = { 'bar': 'buz' };

dataApi.set('/foo',{ entity: foo }).then(function(res){
    if(res.response === 'ok'){
        doSomethingElse();
    }
});