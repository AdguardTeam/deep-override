var assert = require('assert');
var AG_defineProperty = require('./index.js').AG_defineProperty;

suite('deep-override', function() {
    suite('Overriding non-existent object', function() {
        test('Overriding simple object literals', function() {
            var getCount = setCount = 0;
            AG_defineProperty('test1.a.b', { get: function(){getCount++;return 1;}, set: function() {setCount++}, enumerable: true}, global);
            global.test1 = { c : 2 };
            test1.a = { d : 3 };
            test1 = { a : 4, c : 5 };
            test1.a = {};
            test1.a.b = 4;
            test1.a = { b : { e : 6 }, c : 7 };
            assert.equal(test1.c, 5);
            assert.equal(setCount, 1);
            assert.equal(test1.a.b, 1);
            assert.equal(getCount, 1);

            var json = JSON.parse(JSON.stringify(test1)); // ToDo: add ownKeys trap to make this work
            assert.equal(json.a.b, 1);
        });
    });

    suite('Overriding existing object literal', function() {
        test('value should be changed', function() {
            global.test2 = { a: { b: 1, c: 2 }, d: 3 };
            var value = test2.a.b;
            AG_defineProperty('test2.a.b', {value: 4}, global);
            var value2 = test2.a.b;
            assert.equal(value, 1);
            assert.equal(value2, 4);
        });
    });

    // ToDo: Overriding existing object defined with getters and setters
});
