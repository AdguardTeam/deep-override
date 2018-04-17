/**
 * Note: `setCount` tests were mostly disabled, for the specification hasn't settled.
 */

const expect = require('chai').expect;
const assert = require('chai').assert;
const rewire = require('rewire');

const Module = rewire('../build/index.js');

const AG_defineProperty = Module.__get__('AG_defineProperty');
let DeepOverrideHost;
try { DeepOverrideHost = Module.__get__('DeepOverrideHost'); } catch (e) { }


suite('AG_defineProperty', function() {
    let base;

    beforeEach(function() {
        base = {};
    });

    suite('Overriding non-existent object', function() {
        test('Overriding simple object literals', function() {
            let getCount = 0;
            let setCount = 0;

            AG_defineProperty('test1.a.b', {
                get: () => { getCount++; return 1; },
                set: () => { setCount++; },
                enumerable: true
            }, base);

            let test1 = base.test1 = { c : 2 };
            test1.a = { d : 3 };
            test1 = base.test1 = { a : 4, c : 5 };
            test1.a = {};
            test1.a.b = 4;
            test1.a = { b : { e : 6 }, c : 7 };

            assert.equal(test1.c, 5);
            // assert.equal(setCount, 1);
            assert.equal(getCount, 0);
            assert.equal(test1.a.b, 1);
            assert.equal(getCount, 1);

            let json = JSON.parse(JSON.stringify(test1));

            assert.equal(json.a.b, 1);
        });

        test('Overriding implicit globals', function() {
            AG_defineProperty('test7.a', { value: 1 }, global);
            test7 = {};
            test7.a = 2;
            assert.equal(test7.a, 1);

            AG_defineProperty('test8.a', { value: 1 }, global);
            test8 = { a: 2 };
            assert.equal(test8.a, 1);
        });

        test('Overriding object literals with non-configurable writable property', function() {
            let getCount = 0;
            let setCount = 0;

            AG_defineProperty('test.a.b', {
                get: () => { getCount++; return 1; },
                set: () => { setCount++; },
                enumerable: true
            }, base);
            var tmp = {};
            Object.defineProperty(tmp, 'a', {
                value: { b: 0 },
                writable: true
            });
            let test = base.test = tmp;
            assert.equal(test.a.b, 1);
            assert.equal(getCount, 1);
            test.a.b = 0;
            //assert.equal(setCount, 1);
            assert.equal(test.a.b, 1);
        });

        test('Overriding multiple properties without colision', function() {
            let getCount1 = 0;
            let setCount1 = 0;
            let getCount2 = 0;
            let setCount2 = 0;

            AG_defineProperty('test6.a.b', {
                get: () => { getCount1++; return 1; },
                set: () => { setCount1++; }
            }, base);

            AG_defineProperty('test6.a.c', {
                get: () => { getCount2++; return 1; },
                set: () => { setCount2++; }
            }, base);

            let test6 = base.test6 = {};
            test6.a = {};
            test6.a.b = 2;

            //assert.equal(setCount1, 1);
            assert.equal(test6.a.b, 1);
            assert.equal(getCount1, 1);

            test6.a.c = 2;

            //assert.equal(setCount2, 1);
            assert.equal(test6.a.c, 1);
            assert.equal(getCount2, 1);
        });

        test('Shadowing class instance properties', function() {
            let getCount = setCount = 0;
            AG_defineProperty('A.prototype.b.c', {
                get: function() {
                    getCount++;
                    return false;
                },
                set: function() {
                    setCount++;
                }
            }, base);
            base.A = class { };
            base.a = new base.A();
            base.a.b = { c: true }; // This implicitly invokes the setter.
            base.a.b.c = true;
            assert.equal(base.a.b.c, false);
            assert.equal(getCount, 1);
            assert.equal(setCount, 2);
        });
    });

    suite('Overriding existing objects', function() {
        test('New descriptor should be applied', function() {
            base.test2 = { a: { b: 1, c: 2 }, d: 3 };
            var value = base.test2.a.b;
            AG_defineProperty('test2.a.b', { value: 4 }, base);
            var value2 = base.test2.a.b;
            assert.equal(value, 1);
            assert.equal(value2, 4);
            assert.equal(base.test2.propertyIsEnumerable('a'), true);
        });

        test('Overriding object literals with non-configurable writable property', function() {
            var tmp = {};
            Object.defineProperty(tmp, 'a', {
                value: { b: 0 },
                writable: true
            });

            let test0 = base.test0 = tmp;

            var getCount = setCount = 0;
            AG_defineProperty('test0.a.b', {
                get: () => { getCount++; return 1; },
                set: () => { setCount++; },
                enumerable: true
            }, base);

            assert.equal(test0.a.b, 1);
            assert.equal(getCount, 1);
            test0.a.b = 0;
            //assert.equal(setCount, 1);
            assert.equal(test0.a.b, 1);
        });

        test('Overriding nested properties of non-configurable property', function() {
            /**
             * This showcases a bug #12
             * {@link https://github.com/AdguardTeam/deep-override/issues/12}
             */
            Object.defineProperty(base, 'a', {
                value: {},
                writable: true,
                enumerable: true,
                configurable: false
            });

            AG_defineProperty('a.b', { value: 1 }, base);
            AG_defineProperty('a.c.d', { value: 2 }, base);

            base.a.c = {};

            assert.equal(base.a.c.d, 2);
        });

        test('It should concatenate recursion', function() {
            let test3 = base.test3 = {};
            test3.a = {};
            test3.a.b = {};
            test3.a.b.c = test3;
            test3.a.b.c.d = {};
            test3.a.b.c.d.e = {};

            let getCount = setCount = 0;
            AG_defineProperty('test3.a.b.c.d', {
                get: function() {
                    getCount++;
                    return { f: null };
                },
                set: function() {
                    setCount++;
                }
            }, base);

            // Caveat: assert.equal(test3.d.f, null) does not hold in this case.
            // Have to access test3.a.b.c.d once to make test3.d has a desired value.
            assert.equal(test3.a.b.c.d.f, null);
            assert.equal(test3.d.f, null);
        })

        test('It should not throw on pathological recursion', function() {
            let test4 = base.test4 = {};
            test4.a = test4;
            AG_defineProperty('test4.a.a', { value: null }, base);
            assert(test4.a, test4);
        });

        test('It should override configurable object literal with getters and setters', function() {
            let test5 = base.test5 = {
                a: {
                    get b() {
                        return {
                            c: this.c++,
                            d: 2
                        };
                    },
                    set b(i) {
                        this.c += i * 2;
                    },
                    c: 1
                }
            };
            let getCount = setCount = 0;
            assert.equal(test5.a.b.d, 2);
            assert.equal(test5.a.b.c, 2);
            assert.equal(test5.a.propertyIsEnumerable('b'), true);
            assert.equal(JSON.parse(JSON.stringify(test5)).a.b.d, 2);
            AG_defineProperty('test5.a.b.d', {
                get: () => {
                    getCount++;
                    return 3;
                },
                set: (i) => {
                    setCount++;
                }
            }, base);
            assert.equal(base.test5.a.b.d, 3);
            assert.equal(getCount, 1);
            assert.equal(test5.a.b.c, 5);
            assert.equal(test5.a.propertyIsEnumerable('b'), true);
            assert.equal(JSON.parse(JSON.stringify(test5)).a.b.d, 3);
            test5.a.b.d = 4;
            assert.equal(test5.a.b.d, 3);
            assert.equal(getCount, 3);
            //assert.equal(setCount, 1);
        });

        test('Property merge test', function() {
            AG_defineProperty(`test.a.b`, { value: 1}, base);
            AG_defineProperty(`test.c.d`, { value: 2}, base);

            let test = base.test = {};

            test.a = {};
            test.a.b = 3;
            test.c = test.a;
            test.c.d = 4;

            assert.equal(test.a.b, 1);
            assert.equal(test.c.d, 2);
            assert.equal(test.a.d, 2);

            test.a = {};

            assert.equal(test.a.b, 1);
            assert.equal(test.c.d, 2);
            assert.equal(test.a.d, undefined);
        });

        test('Re-assign test', function() {
            AG_defineProperty(`test.a`, { value: 1 }, base);

            let test = base.test = {};
            assert.equal(test.a, 1);

            let tmp = test;

            base.test = base.test;

            assert.equal(base.test, tmp);
            assert.equal(base.test.a, 1);
        });

        test('It should override properties of functions or non-Objects', function() {
            AG_defineProperty('test.a', { value: 1}, base);
            base.test = function() { };
            assert.equal(base.test.a, 1);

            base.test = Object.create(Object.create(null));
            assert.equal(base.test.a, 1);

            base.test = null; // This should not throw
        });

        test('It should override properties which are already defined in an object\'s prototype', function() {
            let value = {};

            let hasGetter = {
                getCount: 0,
                setCount: 0,
                get a() {
                    this.getCount++;
                    return value;
                },
                set a(i) {
                    this.setCount++;
                },
                b: {
                    c: 1
                }
            };

            let ptypeHasGetter = Object.create(hasGetter);

            ptypeHasGetter.getCount = 0;
            ptypeHasGetter.setCount = 0;

            base.test = ptypeHasGetter;

            let getCount = 0;
            let setCount = 0;
            AG_defineProperty('test.a.b', {
                get: function() {
                    getCount++;
                    return 1;
                },
                set: function() {
                    setCount++;
                }
            }, base);

            assert.equal(base.test.a.b, 1);
            assert.equal(value.b, 1);
            assert.equal(base.test.getCount, 1);

            base.test.a = 1;
            assert.equal(base.test.setCount, 1);
            base.test.a = function() {};
            assert.equal(base.test.setCount, 2);
        });
    });
    suite('Extended property descriptors', function() {
        test('before callbacks should be called with expected parameters', function() {
            let toBeMutatedPType;

            base.a = Object.create(Object.create({
                b: {
                    c: Object.create((toBeMutatedPType = Object.create(Object.create({
                        get d() {
                            return 0;
                        },
                        set d(i) {

                        }
                    }))))
                }
            }));

            assert.equal(base.a.b.c.d, 0);

            AG_defineProperty('a.b.c.d', {
                beforeGet: function(target) {
                    this.latestOp = 'get';
                    this.latestTarget = target;
                    this.latestIncoming = undefined;
                },
                beforeSet: function(incoming, target) {
                    this.latestOp = 'set';
                    this.latestTarget = target;
                    this.latestIncoming = incoming;
                }
            }, base);

            base.a.b.c.d = 1;
            assert.equal(base.a.b.c.latestOp, 'set');
            assert.equal(base.a.b.c.latestTarget, base.a.b.c);
            assert.equal(base.a.b.c.latestIncoming, 1);

            assert.equal(base.a.b.c.d, 0);
            assert.equal(base.a.b.c.latestOp, 'get');
            assert.equal(base.a.b.c.latestTarget, base.a.b.c);

            let tmp = base.a.b.c.d = Object.create(null);
            assert.equal(base.a.b.c.latestOp, 'set');
            assert.equal(base.a.b.c.latestTarget, base.a.b.c);
            assert.equal(base.a.b.c.latestIncoming, tmp);

            let setCount = 0;
            Object.defineProperty(toBeMutatedPType, 'd', {
                get: function() {
                    return 2;
                },
                set: function() {
                    setCount++;
                }
            });

            assert.equal(base.a.b.c.d, 2);

            base.a.b.c.d = 2;
            assert.equal(setCount, 1);
        })

        test('Generic property descriptor keys should be applied', function() {
            base.a = 1;
            assert.ok(base.propertyIsEnumerable('a'));

            let getCount = 0;
            AG_defineProperty('a', {
                beforeGet: function() {
                    getCount++;
                },
                enumerable: false,
                configurable: false
            }, base);

            assert.notOk(base.propertyIsEnumerable('a'));
            assert.equal(base.a, 1);
            assert.equal(getCount, 1);

            let desc = Object.getOwnPropertyDescriptor(base, 'a');
            assert.equal(desc.configurable, false);
        });
    });
});


if (typeof DeepOverrideHost !== 'undefined') {
    suite('DeepOverrideHost', function() {
        suite('applyObjectState', function() {
            test('it combines simple state tree', function () {
                var overrider = new DeepOverrideHost();

                var baseState1 = new DeepOverrideHost.ObjectState();
                var baseState2 = new DeepOverrideHost.ObjectState();

                overrider.buildAbstractStateTree('a.b.c', baseState1).providedDesc = { value: 1 };
                overrider.buildAbstractStateTree('a.b.d', baseState2).providedDesc = { value: 2 };

                overrider.applyObjectState(baseState1, baseState2);

                assert.equal(baseState1.ownProps['a'].obj.ownProps['b'].obj.ownProps['c'].providedDesc.value, 1);
                assert.equal(baseState1.ownProps['a'].obj.ownProps['b'].obj.ownProps['d'].providedDesc.value, 2);
            })
        })
    })
}
