
/**
 * We later construct a proxy which holds a property descriptor but acts indepentently of it.
 * To do so, we need a pure JS implemented property descriptors.
 * @constructor
 * @param {!ObjectPropertyDescriptor|undefined} descriptor
 * @param {*} obj
 * @final
 */
function Descriptor(descriptor, obj) {
    if ( typeof descriptor != 'undefined' ) {
        // Calls odp to a temp variable to validate the descriptor.
        // If needed, the correct behavior of odp can be implemented by following the specification.
        var tmp = {};
        tmp = Object.defineProperty(tmp, '.', descriptor); // An error will be thrown here, if the descriptor is invalid.
        var desc = Object.getOwnPropertyDescriptor(tmp, '.');
        if ( desc.hasOwnProperty('value') ) {
            this.isDataDescriptor = true;
            this.value = desc['value'];
            this.writable = desc['writable'];
        } else if ( desc.hasOwnProperty('get') ) {
            this.isDataDescriptor = false;
            this.get = desc['get'];
            this.set = desc['set'];
        }
        this.configurable = desc['configurable'];
        this.enumerable = desc['enumerable'];
    }
    this.obj = obj;
}

Descriptor.prototype.invokeGet = function() {
    if ( typeof this.isDataDescriptor == 'undefined' ) { return undefined; }
    if ( this.isDataDescriptor ) { return this.value; }
    if (!this.get) return;
    return this.get.call(this.obj);
};

/**
 * @return {boolean}
 */
Descriptor.prototype.invokeSet = function(incoming) {
    if ( typeof this.isDataDescriptor == 'undefined' ) {
        this.value = incoming;
        this.isDataDescriptor = this.writable = this.configurable = this.enumerable = true;
        return true;
    }
    if ( this.isDataDescriptor ) {
        if ( !this.writable ) {
            return false; // Should throw in strict mode
        }
        this.value = incoming;
        return true;
    }

    if ( !this.set ) return true;
    return this.set.call(this.obj, incoming);
};

/**
 * @return {!ObjectPropertyDescriptor|undefined}
 */
Descriptor.prototype.getDescriptor = function() {
    if ( typeof this.isDataDescriptor == 'undefined' ) { return undefined; }
    var r = Object.create(null);
    r['writable'] = this.writable;
    r['configurable'] = this.configurable;
    r['enumerable'] = this.enumerable;
    if ( this.isDataDescriptor ) {
        r['value'] = this.value;
    } else {
        r['get'] = this.get;
        r['set'] = this.set;
    }
    return /** @type {!ObjectPropertyDescriptor} */(r);
};

/**
 * Constructs a Proxy instance which reflects the behavior of the original (orig) object,
 * except for the property (this.prop) that we want to override.
 * For the property we override, the instance holds its property descriptor, but act independently of it.
 * For instance, '[[Get]]'ing it will return another Proxy instance which holds the next nested object,
 * which goes until we reach at the top of the ladder.
 * @constructor
 * @param {*} orig
 * @param {string} path
 * @param {!ObjectPropertyDescriptor} descriptor
 * @param {number} flag
 * @property {string} prop
 * @property {boolean} isLast
 * @property {!Descriptor|undefined} desc
 * @property {number} flag
 * @final
 */
function DescriptorProxy(orig, path, descriptor, flag) {
    var pos = path.indexOf('.');
    var nextPath = path.slice(pos + 1);
    var isLast = this.isLast = nextPath.length === 0;
    this.prop = path.slice(0, pos);
    if ( !isLast && !(orig instanceof Object) ) {
        this.desc = undefined;
        this.proxy = orig;
    } else {
        this.orig = orig;
        this.desc = new Descriptor(isLast ? descriptor : Object.getOwnPropertyDescriptor(orig, this.prop), orig);
        var handler = new Proxy(Object.create(null), { get: this._handlerGetter.bind(this) });
        var target = orig instanceof Object ? orig : Object.create(null);
        this.proxy = new Proxy(target, handler);
    }
    this.flag = flag;
    this.nextStep = function (value) {
        return new DescriptorProxy(value, nextPath, descriptor, flag);
    };
}

DescriptorProxy.TRANSPARENT = 0;
DescriptorProxy.OPAQUE = 1;

/**
 * @param {Function} handler
 * @param {*} bind
 */
function makeInvoke(handler, bind) {
    return function() {
        var val = handler.apply(null, arguments);
        if ( typeof val == 'function' ) {
            return new Proxy(val, {
                apply: function(target, thisArg, argumentsList) {
                    return target.apply(bind, argumentsList);
                }
            });
        } else {
            return val;
        }
    };
}

/**
 * @param {*} _
 * @param {string} name
 */
DescriptorProxy.prototype._handlerGetter = function(_, name) {
    var handler;
    if (!this[name]) {
        // handler = Reflect[name];
        handler = Reflect[name].bind(this, this.orig);
    } else {
        handler = function() {
            return (arguments[1] == this.prop ? this : Reflect)[name].apply(this, arguments);
        }.bind(this);
    }
    if ( name == 'get' ) { return makeInvoke(handler, this.orig); }
    else { return handler; }
};

DescriptorProxy.prototype['get'] = function(target, name) {
    var value = this.desc.invokeGet();
    return this.isLast ? value : this.nextStep(value).proxy;
};

DescriptorProxy.prototype['set'] = function(target, property, value, receiver) {
    return this.desc.invokeSet(value);
};

DescriptorProxy.prototype['has'] = function(target, property) {
    return !(typeof this.desc.isDataDescriptor == 'undefined');
};

/**
 * @param {!ObjectPropertyDescriptor} descriptor
 */
DescriptorProxy.prototype['defineProperty'] = function(target, property, descriptor) {
    if ( !(this.orig instanceof Object) ) { throw new TypeError('Object.defineProperty called on non-object'); }
    if ( this.isLast ) { return false; }
    // In this case, it should behave transparently in order to preserve invariants.
    // We may implement the logic manually based on the specification.
    // However, we stick with a simple way for now.
    var tmp = {};
    try {
        Object.defineProperty(/** @type {!Object} */(this.orig), this.prop, descriptor);
        Object.defineProperty(tmp, '.', descriptor);
        var desc1 = Object.getOwnPropertyDescriptor(this.orig, this.prop);
        var desc2 = Object.getOwnPropertyDescriptor(tmp, '.');
        // Shallow compare
        if ( desc1['value'] !== desc2['value'] ) return false;
        if ( desc1['get'] !== desc2['get'] ) return false;
        if ( desc1['set'] !== desc2['set'] ) return false;
        if ( desc1['writable'] !== desc2['writable'] ) return false;
        if ( desc1['configurable'] !== desc2['configurable'] ) return false;
        if ( desc2['enumerable'] !== desc2['enumerable'] ) return false;
        this.desc = new Descriptor(desc1, this.orig);
        return true;
    } catch (e) { return false; }
};

DescriptorProxy.prototype['getOwnPropertyDescriptor'] = function(target, property) {
    var _desc = this.desc;
    if( !_desc ) {
        return undefined;
    }
    var desc = _desc.getDescriptor();
    if ( this.flag == DescriptorProxy.TRANSPARENT || this.isLast ) {
        return desc;
    }
    if ( _desc.isDataDescriptor ) {
        desc['value'] = this.nextStep(_desc.value).proxy;
    } else {
        desc['get'] = desc['get'] ? new Proxy(desc['get'], {
            apply: function(target, thisArg, argumentsList) {
                var val = target.apply(this.orig, argumentsList);
                return this.nextStep(val).proxy;
            }
        }) : undefined;
    }
    return desc;
};

/*************/

var global = this;

/**
 * @param {string} path
 * @param {!ObjectPropertyDescriptor} descriptor
 * @param {number|undefined} flag
 * @return {undefined}
 */
function AG_defineProperty (path, descriptor, flag) {
    flag = flag || 0;
    var pos = path.indexOf('.');
    if( pos == -1 ) {
        Object.defineProperty( global, path, descriptor );
        return;
    }
    var prop = path.slice(0, pos);
    path = path.slice(pos + 1) + '.';
    var desc = new Descriptor(Object.getOwnPropertyDescriptor(global, prop), global);
    if ( desc.configurable !== false ) {
        Object.defineProperty(global, prop, {
            get: function() {
                return (new DescriptorProxy(desc.invokeGet(), path, descriptor, /** @type {number} */(flag))).proxy;
            },
            set: function(value) {
                return desc.invokeSet(value);
            }
        });
    } else if ( desc.writable !== false ) {
        global[prop] = (new DescriptorProxy(desc.invokeGet(), path, descriptor, flag)).proxy;
    } else {
        console.warn("AG_defineProperty: '" + prop + "' is not configurable nor writable, exiting");
        return;
    }
}

this['AG_defineProperty'] = AG_defineProperty;
