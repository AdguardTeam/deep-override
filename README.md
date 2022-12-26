# About

Experimental function to transparently override nested JS objects.

# How to use it

```
AG_defineProperty(path_to_the_property:string, descriptor:ExtendedPropertyDescriptor, base?:object):void
```
In short, whenever a nested property `path_to_the_property` of an object `base` (defaults to `window`) _can be_ accessed, it will _already_ have a property descriptor provided by you with `AG_defineProperty` call.

## When it works

`AG_defineProperty` works by defining getters and setters on objects in the nested property.
If a property was already defined when `AG_defineProperty` call was made, it will try to re-define property descriptors with getters and setters, keeping the original value.

### Overriding non-configurable properties
If such a property was non-configurable, we cannot re-define it, and instead it will try to directly mutate the property's value. If it was an accessor property, `AG_defineProperty` will invoke the getter _once_ in order to obtain property's value.

If a property is defined after `AG_defineProperty` call with `Object.defineProperty`, such operation is likely to fail, since `AG_defineProperty` attaches a non-configurable property descriptor (This limitation can be overcomed with ES6 `Proxy`, but this approach has its own limitations).

### Multiple calls to a single object

Defining properties on a single object multiple times will succeed as long as it does not attempt to define a descriptor provided by you with `configurable: false` more than once on a single object.

## Access side-effect descriptors

`AG_defineProperty` supports _Access side-effect descriptors_, as an extension of ECMAScript Property descriptors.

Recall that a property descriptor is an [accessor descriptor](https://tc39.github.io/ecma262/#sec-isaccessordescriptor) if it owns either a property `get` or `set`, and a [data descriptor](https://tc39.github.io/ecma262/#sec-isdatadescriptor) if it owns eiter a property `value` or `writable`, and a [generic descriptor](https://tc39.github.io/ecma262/#sec-isgenericdescriptor) otherwise.

A property descriptor is an _access side-effect descriptor_ if it owns either a property `beforeGet` or `beforeSet`. It can have additionally `configurable`, `enumerable` properties. Those callbacks are called just before the original getter/setter, with some arguments: `beforeGet` is called with the original owner of the property, and `beforeSet` is called with the incoming value and the original owner of the property. In addition, a value returned from `beforeSet` is fed to the original setter.

### Example

```
AG_defineProperty('onerror', {
    beforeGet: function() {
        console.log('retrieving global error event handler');
    },
    beforeSet: function(i) {
        console.log('setting global error event handler');
        return function wrapper(evt) {
            console.error(evt);
            i.apply(this, arguments);
        }
    }
});
```

# How to build

Install dependencies by running:
```
yarn install
```
The dev build without minification can be built with:
```
yarn run build-dev
```
The minified build is available with:
```
yarn run build
```
Run tests with build output with:
```
yarn run test
```
