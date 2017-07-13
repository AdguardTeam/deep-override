var AG_defineProperty = (function() {

    function Descriptor(descriptor, obj) {
        if ( descriptor ) {
            if ( descriptor.hasOwnProperty('value') ) {
                this.value = descriptor.value;
                this.isDataDescriptor = true;
            } else {
                this.get = descriptor.get;
                this.set = descriptor.set;
                this.isDataDescriptor = false;
            }

            Descriptor.COMMON_KEYS.forEach(function(key) {
                this[key] = descriptor.hasOwnProperty(key) ? descriptor[key] : false;
            }.bind(this));
        }

        this.obj = obj;
    }

    Descriptor.prototype.invokeGet = function() {
        if ( typeof this.isDataDescriptor == 'undefined' ) { return undefined; }
        if ( this.isDataDescriptor ) { return this.value; } 
        if (!this.get) return;
        return this.get.call(this.obj);
    };

    Descriptor.prototype.invokeSet = function(incoming) {
        if ( typeof this.isDataDescriptor == 'undefined' ) {
            this.value = incoming;
            this.isDataDescriptor = true;
            Descriptor.COMMON_KEYS.forEach(function(key) {
                this[key] = true;
            });
            return true;
        }
        if ( this.isDataDescriptor ) {
            if ( !this.writable ) {
                return false; // ToDo: throw in strict mode
            }
            this.value = incoming;
            return true;
        }
        
        if (!this.set) return true;
        return this.set.call(this.obj, incoming);
    };

    Descriptor.prototype.getDescriptor = function() {
        if ( typeof this.isDataDescriptor == 'undefined' ) { return undefined; }
        var r = Object.create(null);
        Array.prototype.concat.call(this.isDataDescriptor ? Descriptor.DATA_DESC_KEYS : Descriptor.ACCESSOR_DESC_PROPS, Descriptor.COMMON_KEYS).forEach(function(key) {
            r[key] = this[key];
        });
        return r;
    };

    Descriptor.DATA_DESC_KEYS = ['value'];
    Descriptor.ACCESSOR_DESC_KEYS = ['get', 'set'];
    Descriptor.COMMON_KEYS = ['writable', 'configurable', 'enumerable'];

    function DescriptorProxy(orig, path, descriptor, flag) {
        var pos = path.indexOf('.');
        var nextPath = path.slice(pos + 1);
        var isLast = this.isLast = nextPath.length === 0;
        
        this.prop = path.slice(0, pos);

        if( !isLast && !(orig instanceof Object) ) {
            this.desc = undefined;
            this.proxy = orig;
        } else {
            this.orig = orig;
            this.desc = new Descriptor(isLast ? descriptor : Object.getOwnPropertyDescriptor(orig, this.prop), orig);

            var handler = new Proxy({}, { get: this._handlerGetter.bind(this) });
            var target = orig instanceof Object ? orig : Object.create(null);

            this.proxy = new Proxy(target, handler);
        }

        this.nextStep = function (value) {
            return new DescriptorProxy(value, nextPath, descriptor, flag);
        };
    }

    DescriptorProxy.TRANSPARENT = 0;
    DescriptorProxy.OPAQUE = 1;

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
        }
    }

    DescriptorProxy.prototype._handlerGetter = function(_, name) {
        var handler;
        if (!this[name]) {
            handler = Reflect[name];
        } else {
            handler = function() {
                return (arguments[1] == this.prop ? this : Reflect)[name].apply(this, arguments);
            }.bind(this);
        }

        if ( name == 'get' ) { return makeInvoke(handler, this.orig); }
        else { return handler; }
    };

    DescriptorProxy.prototype.get = function(target, name) {
        var value = this.desc.invokeGet();
        return this.isLast ? value : this.nextStep(value).proxy;
    };

    DescriptorProxy.prototype.set = function(target, property, value, receiver) {
        return this.desc.invokeSet(value);
    };

    DescriptorProxy.prototype.has = function(target, property) {
        return !(typeof this.desc.isDataDescriptor == 'undefined');
    };

    DescriptorProxy.prototype.defineProperty = function(target, property, descriptor) {
        if ( !this.desc || !this.desc.configurable ) {
            this.desc = new Descripter(descriptor);
            return this.proxy;
        } else {
            throw new TypeError('Cannot redefine property: ' + property);
        }
    };

    DescriptorProxy.prototype.getOwnPropertyDescriptor = function(target, property) {
        var _desc = this.desc;
        if( !_desc ) {
            return undefined;
        }
        var desc = _desc.getDescriptor();
        if ( this.flag == DescriptorProxy.TRANSPARENT || this.isLast ) {
            return desc;
        }

        if ( _desc.isDataDescriptor ) {
            desc.value = this.nextStep(_desc.value).proxy;
        } else {
            desc.get = desc.get ? new Proxy(desc.get, {
                apply: function(target, thisArg, argumentsList) {
                    var val = target.apply(this.orig, argumentsList);
                    return this.nextStep(val).proxy;
                }
            }) : undefined;
        }

        return desc;
    };

    /*************/

    var AG_defineProperty = function (path, descriptor, flag) {
        flag = flag || 0;
        var pos = path.indexOf('.');

        if( pos == -1 ) {
            Object.defineProperty( window, path, descriptor );
            return;
        }
        prop = path.slice(0, pos);
        path = path.slice(pos + 1) + '.';

        var desc = new Descriptor(Object.getOwnPropertyDescriptor(window, prop), window);
        window.asdf  = desc;

        if ( desc.configurable !== false ) {
            Object.defineProperty(window, prop, {
                get: function() {
                    return (new DescriptorProxy(desc.invokeGet(), path, descriptor, flag)).proxy;
                },
                set: function(value) {
                    return desc.invokeSet(value);
                }
            });
        } else if ( desc.writable !== false ) {
            window[prop] = (new DescriptorProxy(desc.invokeGet(), path, descriptor, flag)).proxy;
        } else {
            console.warn("AG_defineProperty: '" + prop + "' is not configurable nor writable, exiting");
            return;
        }
    };

    return AG_defineProperty;
})();