var assert = require('assert');
var AG_defineProperty = require('./index.js').AG_defineProperty;

suite('deep-override', function() {
    suite('Overriding non-existent object', function() {
        test('Overriding simple object literals', function() {
            var getCount = setCount = 0;
            AG_defineProperty('test1.a.b', {
                get: () => { getCount++;return 1; },
                set: () => { setCount++; },
                enumerable: true
            }, global);
            global.test1 = { c : 2 };
            test1.a = { d : 3 };
            test1 = { a : 4, c : 5 };
            test1.a = {};
            test1.a.b = 4;
            test1.a = { b : { e : 6 }, c : 7 };
            assert.equal(test1.c, 5);
            assert.equal(setCount, 1);
            assert.equal(getCount, 0);
            assert.equal(test1.a.b, 1);
            assert.equal(getCount, 1);
            var json = JSON.parse(JSON.stringify(test1));
            assert.equal(json.a.b, 1);
        });
    });

    suite('Overriding existing objects', function() {
        test('New descriptor should be applied', function() {
            global.test2 = { a: { b: 1, c: 2 }, d: 3 };
            var value = test2.a.b;
            AG_defineProperty('test2.a.b', { value: 4 }, global);
            var value2 = test2.a.b;
            assert.equal(value, 1);
            assert.equal(value2, 4);
        });

        test('It should concatenate recursion', function() {
            global.test3 = {};
            test3.a = {};
            test3.a.b = {};
            test3.a.b.c = test3;
            test3.a.b.c.d = {};
            test3.a.b.c.d.e = {};

            var getCount = setCount = 0;
            AG_defineProperty('test3.a.b.c.d', {
                get: function() {
                    getCount++;
                    return { f: null };
                },
                set: function() {
                    setCount++;
                }
            }, global);

            // Caveat: assert.equal(test3.d, null) does not hold in this case.
            // Have to access test3.a.b.c.d once to make test3.d has a desired value.
            assert(test3.a.b.c.d, null);
            assert(test3.d, null);
        })

        test('It should not throw on pathological recursion', function() {
            global.test4 = {};
            test4.a = test4;
            AG_defineProperty('test4.a.a', { value: null }, global);
            assert(test4.a, test4);
        });

        test('It should override configurable object literal with getters and setters', function() {
            global.test5 = {
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
            var getCount = setCount = 0;
            assert.equal(test5.a.b.d, 2);
            assert.equal(test5.a.b.c, 2);
            AG_defineProperty('test5.a.b.d', {
                get: () => {
                    getCount++;
                    return 3;
                },
                set: (i) => {
                    setCount++;
                }
            }, global);
            assert.equal(test5.a.b.d, 3);
            assert.equal(getCount, 1);
            assert.equal(test5.a.b.c, 4);
            test5.a.b.d = 4;
            assert.equal(test5.a.b.d, 3);
            assert.equal(getCount, 2);
            assert.equal(setCount, 1);
        });

    });
});
