describe("Policy Repository Point",function() {

    var prp;
    describe("default behavior and policy acquisition failure.",function(){
        beforeEach(function(){
            prp = new ozpIwc.policyAuth.PRP();
        });

        it("formats server loaded policies as Policy Elements",function(){
            var policy = prp.formatPolicy(mockPolicies['policy/connect']);
            expect(policy.evaluate).not.toBeUndefined();
        });

        it('sets any policy that cannot be acquired to denyAll',function(done){



            prp.getPolicies("SOMEFAKEPOLICY")
                .success(function(policies){
                    expect(policies[0].evaluate()).toEqual("Deny");
                    done();
                })
        });

        it('handles no policies in the check',function(){
            prp.getPolicies([])
                .success(function(policies){
                    expect(policies[0].evaluate()).toEqual("Permit");
                });
        });

        it('always applies persistent policies to any policy request',function(){

            prp = new ozpIwc.policyAuth.PRP({
                'persistentPolicies': ['somePolicy']
            });


            prp.getPolicies([],'urn:oasis:names:tc:xacml:3.0:policy-combining-algorithm:deny-overrides')
                .success(function(policies){
                    expect(policies.length).toEqual(1);
                    expect(policies[0].evaluate()).toEqual("Deny");
                });
        });


    });

    describe("policy acquisition success",function(){
        beforeEach(function(){

            // make all policy requests reject to test the denyAll functionality
            spyOn(ozpIwc.util,"ajax").and.callFake(function(){
                return new Promise(function(resolve,reject){
                    resolve({
                        'response': mockPolicies['/policy/connect']
                    });
                });
            });

            prp = new ozpIwc.policyAuth.PRP();
        });

        it("fetches desired policies.",function(done){
            prp.fetchPolicy("/policy/connect")
                .success(function(policy){
                    expect(policy.policyId).toEqual(mockPolicies['/policy/connect'].policyId);
                    expect(policy.version).toEqual(mockPolicies['/policy/connect'].version);
                    expect(policy.description).toEqual(mockPolicies['/policy/connect'].description);
                    expect(policy.rule.category).toEqual(mockPolicies['/policy/connect'].rule.category);
                    expect(policy.ruleCombiningAlgId).toEqual(mockPolicies['/policy/connect'].ruleCombiningAlgId);
                    done();
                })
        });


        it("returns a promise chain with policy evaluation call for the PDP",function(done){
            prp.getPolicies("/policy/connect")
                .success(function(policies){
                    expect(Array.isArray(policies)).toEqual(true);
                    expect(policies.length).toEqual(1);
                    done();
                });
        });
    });
});
