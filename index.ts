let DEBUG = false;

/****************************************************************************************/

type stringmap<T> = {
  [id: string]: T
};

/** Recursively marks properties as readonly. */
type readonly<T> = {
  readonly [P in keyof T]: readonly<T[P]>;
}

/****************************************************************************************/
// Missing declaration for TS
declare interface Object {
  __lookupGetter__(prop: PropertyKey): Function | undefined
  __lookupSetter__(prop: PropertyKey): Function | undefined
}

/****************************************************************************************/
// Workaround for [Symbol.toStringTag] requirement of TS
interface IWeakMap<K extends object, V> {
  delete(key: K): boolean;
  get(key: K): V | undefined;
  has(key: K): boolean;
  set(key: K, value: V): this;
}

interface IWeakMapCtor {
  // In our use-cases, instantiation with entries won't be used.
  new <K extends object, V>(): IWeakMap<K, V>;
  readonly prototype: IWeakMap<object, any>;
}

/****************************************************************************************/
// Originally from https://github.com/Polymer/WeakMap

let wm: IWeakMapCtor;
const defineProperty = Object.defineProperty;

if (typeof WeakMap == 'function') {
  wm = WeakMap;
} else {
  let counter = 0;
  wm = class WM<K, V> {
    private $name: string;
    constructor() {
      this.$name = (counter += Math.random()).toString();
    }
    set(key: K, value: V) {
      let entry = key[this.$name];
      if (entry && entry[0] === key)
        entry[1] = value;
      else
        defineProperty(key, this.$name, { value: [key, value], writable: true });
      return this;
    }
    get(key: K): V {
      let entry;
      return (entry = key[this.$name]) && entry[0] === key ?
        entry[1] : undefined;
    }
    delete(key: K): boolean {
      var entry = key[this.$name];
      if (!entry) return false;
      var hasValue = entry[0] === key;
      entry[0] = entry[1] = undefined;
      return hasValue;
    }
    has(key: K): boolean {
      var entry = key[this.$name];
      if (!entry) return false;
      return entry[0] === key;
    }
  }
}

/****************************************************************************************/

declare interface ExtendedPropertyDescriptor extends PropertyDescriptor {
  beforeGet?: (target?: object) => void
  beforeSet?: (incomming?: object, target?: object) => void
}

/****************************************************************************************/
/****************************************************************************************

  It is an obligation of each methods to make sure that following preconditions are met:

    1. A concrete object state owns only concrete property state,
      and vice versa for abstract object states.

    2. If a concrete object state owns a property state, a property descriptor should
      have been defined with either propState's provideDesc or descProxy.

**/

/**
 * Abstract object state does not have `$raw` member.
 */
interface IObjectState {
  ownProps: stringmap<IPropertyState>
  $raw?: object
  isConcrete(): boolean
}

/**
 * Abstract property state does not have `desc` member.
 */
interface IPropertyState {
  readonly owner: IObjectState
  readonly prop: string
  readonly obj: IObjectState
  /**
   * Descriptor which the property would have had if it weren't overridden.
   * It will be defined when:
   *  - A property was existing before AG_defineProperty call.
   * will be modified when:
   *  - A property was undefined / was a writable data descriptor and assignment.
   */
  desc?: PropertyDescriptor
  /**
   * Descriptors provided with AG_defineProperty call.
   */
  providedDesc?: readonly<ExtendedPropertyDescriptor>
  isConcrete(): boolean
}

/****************************************************************************************/

// Defining classes as static properties of a class does not work well with tsickle,
// due to its implicit type.

class ObjectState implements IObjectState {
  public ownProps: stringmap<IPropertyState> = Object.create(null);
  constructor(
    public $raw?: object
  ) { }
  isConcrete(): boolean {
    return typeof this.$raw !== 'undefined';
  }
}

class PropertyState implements IPropertyState {
  public desc: PropertyDescriptor | undefined
  constructor(
    public readonly owner: IObjectState,
    public readonly prop: string,
    public readonly obj: IObjectState,
    public providedDesc?: readonly<ExtendedPropertyDescriptor>
  ) { }
  isConcrete(): boolean {
    return this.owner.isConcrete();
  }
}

/****************************************************************************************/
/****************************************************************************************/

class DeepOverrideHost {

  /****************************************************************************************/

  static readonly ObjectState = ObjectState
  static readonly PropertyState = PropertyState

  /****************************************************************************************/

  /**
   * When a property `propState` wasn't defined on `owner` previously by us
   * and need to be defined, this method is invoked.
   *
   * @todo Write property merge tests for access side-effect descriptors
   * {@link https://github.com/seanl-adg/deep-override/issues/4}
   */
  clonePropState(propState: readonly<IPropertyState>, owner: IObjectState): IPropertyState {
    let prop = propState.prop;
    let isConcrete = owner.isConcrete();
    let origDesc:PropertyDescriptor|undefined;
    let isNonConfigurable = false;
    let nonConfigurableValue;

    if (isConcrete) {
      origDesc = DescriptorUtils.getOwnPropertyDescriptor(owner.$raw, prop);
      if (origDesc && !origDesc.configurable) {
        isNonConfigurable = true;
        // This invokes the setter possibly once.
        nonConfigurableValue = owner.$raw![prop];
      }
    }
    let nextObjState = !isNonConfigurable ?
      new DeepOverrideHost.ObjectState(propState.obj.$raw) :
      this.getObjectState(nonConfigurableValue);

    this.applyObjectState(nextObjState, propState.obj);

    let cloned = new DeepOverrideHost.PropertyState(owner, prop, nextObjState, propState.providedDesc);

    owner.ownProps[prop] = cloned;

    if (isConcrete) {
      cloned.desc = origDesc;

      let newDesc = this.getConcretePropDesc(cloned);

      if (!isNonConfigurable) {
        DescriptorUtils.defineProperty(owner.$raw, prop, newDesc);
        /**
         * `AG_defineProperty('a.b', { get(), set() });, window.a = { b: 1 };` should
         * call the setter with incoming value `1`.
         */
        if (origDesc && DescriptorUtils.isDataDescriptor(origDesc)) {
          DescriptorUtils.invokeSetter(newDesc, origDesc.value, owner.$raw);
          /**
           * `var a = {}; window.b = a; AG_defineProperty('b.c', { value: 1})` should
           * override `a` so that `a.c = 1`.
           */
          this.applyObjectStateRaw(origDesc.value, propState.obj);
        }
      } else {
        /**
        * In this case, we cannot redefine the current property,
        * so we proceed directly to override the value.
        * If it was defined as a getter, we call it once.
        */
        this.applyObjectStateRaw(nonConfigurableValue, propState.obj);
      }
    }

    return cloned;
  }

  /****************************************************************************************/

  /**
   * For a given given property state `propState`, this method creates a property descriptor to be
   * actually defined on a 'concrete' object and concrete property.
   */
  getConcretePropDesc(propState: IPropertyState): PropertyDescriptor {
    let providedDesc = propState.providedDesc;
    if (providedDesc && !DescriptorUtils.isAccessSideEffectDescriptor(providedDesc)) {
      return DescriptorUtils.cloneDesc(providedDesc)!;
    }

    const overrider = this;
    // configurable, enumerable properties will follow that of the original descriptor.
    // See www.ecma-international.org/ecma-262/6.0/#sec-validateandapplypropertydescriptor
    // for the precise logic.
    const proxyDesc:PropertyDescriptor = {
      get: function () { return overrider.$get(propState, this); },
      set: function (incoming) { return overrider.$set(propState, incoming, this); }
    };

    /**
     * Adorns the proxyDesc with provided generic property descriptors.
     */
    providedDesc && DescriptorUtils.cloneGenericDescKeys(providedDesc, proxyDesc);

    return proxyDesc;
  }

  /****************************************************************************************/

  /**
   * Get operation, X.Y
   * @param propState propState(X.Y)
   */
  $get(propState: IPropertyState, _this: any): any {
    let providedDesc = propState.providedDesc;
    if (providedDesc && providedDesc.beforeGet) {
      (<Function>providedDesc.beforeGet).call(_this, propState.owner.$raw);
    }
    let value = this.invokeGetter(propState, _this);
    if (_this === propState.owner.$raw || DescriptorUtils.isPrototypeOf.call(propState.owner.$raw, _this)) {
      this.applyObjectStateRaw(value, propState.obj);
    }
    return value;
  }

  /**
   * Set operation, X.Y = Z
   * @param propState propState(X.Y)
   * @param incoming Z
   */
  $set(propState: IPropertyState, incoming: any, _this: any): any {
    if (_this !== propState.owner.$raw && !DescriptorUtils.isPrototypeOf.call(propState.owner.$raw, _this)) {
      return this.invokeSetter(propState, incoming, _this);
    }
    if (propState.providedDesc && propState.providedDesc.beforeSet) {
      incoming = (<Function>propState.providedDesc.beforeSet).call(_this, incoming, _this);
    }

    // Quick path for X.Y = X.Y.
    let desc = propState.desc;
    if (desc && DescriptorUtils.isDataDescriptor(desc) && desc.value === incoming) {
      return true;
    }
    let ret = this.invokeSetter(propState, incoming, _this);
    if (!DescriptorUtils.isExpando(incoming)) {
      return ret;
    }
    let objState = this.getObjectState(incoming);
    this.applyObjectState(objState, propState.obj);
    return ret;
  }

  /****************************************************************************************/

  /**
   * @param abstractObjectState ***Beware*** This argument should not be mutated.
   * It should be cloned when part of its information need to be transfered to `objState`.
   * @param objState This argument will be mutated.
   */
  applyObjectState(objState: IObjectState, abstractObjectState: readonly<IObjectState>): void {
    for (let prop in abstractObjectState.ownProps) {
      let readonlyPropState = abstractObjectState.ownProps[prop];
      if (!objState.ownProps[prop]) {
        this.clonePropState(readonlyPropState, objState);
      } else {
        this.applyProp(objState.ownProps[prop], readonlyPropState);
      }
    }
  }

  applyObjectStateRaw(obj, idealObjectState: readonly<IObjectState>) {
    if (!DescriptorUtils.isExpando(obj)) { return obj; }
    let objState = this.getObjectState(obj);
    this.applyObjectState(objState, idealObjectState);
  }

  /**
   * @param abstractPropertyState ***Beware*** This argument should not be mutated.
   */
  applyProp(propState: IPropertyState, abstractPropertyState: readonly<IPropertyState>): void {
    if (abstractPropertyState.providedDesc) {
      if (propState.providedDesc) {
        if (abstractPropertyState.providedDesc === propState.providedDesc) {
          // Intentionally blank
        } else {
          if (propState.isConcrete()) {
            // already overwritten
            DeepOverrideHost.warnNonConfigurableProperty(propState.prop);
          } else {
            DeepOverrideHost.warnCircularReference(propState.prop);
          }
        }
      } else {
        if (propState.isConcrete()) {
          if (propState.desc) {
            // Intentionally blank
          } else {
            propState.desc = DescriptorUtils.cloneDesc(abstractPropertyState.providedDesc);
          }
        } else {
          DeepOverrideHost.warnNonConfigurableProperty(propState.prop);
        }
      }
    }

    if (propState.obj && abstractPropertyState.obj) {
      if (propState.obj !== abstractPropertyState.obj) {
        this.applyObjectState(propState.obj, abstractPropertyState.obj);
      }
    }
  }

  /****************************************************************************************/

  invokeSetter(propState: IPropertyState, incoming, _this): boolean {
    let desc = propState.desc;
    if (!desc) {
      /**
       * We have defined the property on `propState.owner.$raw`, as per the contract.
       * If a property setter is present in one of its prototype object, we should
       * invoke it, otherwise we should define a new data property on the owner.
       * @todo link an ECMAScript specification
       */
      let ownerPType = DescriptorUtils.getPrototypeOf(propState.owner.$raw);
      if (ownerPType !== null) {
        let setterOnPType = DescriptorUtils.lookupSetter.call(ownerPType, propState.prop);
        if (setterOnPType) {
          return setterOnPType.call(_this, incoming);
        }
      }
      if (!DescriptorUtils.isExtensible(propState.owner.$raw)) {
        DeepOverrideHost.warnNonExtensibleProperty(propState.prop);
        return false;
      }
      propState.desc = DescriptorUtils.getPropertyWriteDescriptor(incoming);
      return true;
    }
    return DescriptorUtils.invokeSetter(desc, incoming, _this);
  }

  invokeGetter(propState: IPropertyState, _this) {
    let desc = propState.desc;
    if (!desc) {
      const owner = propState.owner.$raw!;
      if (!(propState.prop in owner)) { return; }
      let ownerPType = DescriptorUtils.getPrototypeOf(owner);
      if (ownerPType !== null) {
        let getter = DescriptorUtils.lookupGetter.call(ownerPType, propState.prop);
        if (getter) { return getter.call(_this); }
        else { return ownerPType[propState.prop]; }
      }
      return;
    }
    return DescriptorUtils.invokeGetter(desc, _this);
  }

  /****************************************************************************************/

  static warn: (msg: string) => void = DEBUG && typeof console !== 'undefined' ? (msg: string): void => {
    console.warn(`AG_defineProperty: ${msg}`);
  } : () => { }

  static warnNonConfigurableProperty(prop: string): void {
    DeepOverrideHost.warn(`cannot redefine non-configurable property ${prop}.`);
  }

  static warnNonExtensibleProperty(prop: string): void {
    DeepOverrideHost.warn(`cannot define a property ${prop} on a non-extensible object.`);
  }

  /**
   * Consider setting such properties to be non-writable.
   */
  static warnNonConfigurableWritableProperty(prop: string): void {
    DeepOverrideHost.warn(`skipped proxying a non-configurable writable property ${prop}, property may be written again.`)
  }

  static warnCircularReference(prop: string): void {
    DeepOverrideHost.warn(`unresolvable circular referrence with property ${prop}.`);
  }

  /****************************************************************************************/

  private objectStateMap: IWeakMap<object, IObjectState>

  getObjectState(obj: object): IObjectState {
    let state = this.objectStateMap.get(obj);
    if (!state) {
      state = new DeepOverrideHost.ObjectState(obj);
      this.objectStateMap.set(obj, state);
    }
    return state;
  }

  /****************************************************************************************/

  constructor() {
    this.objectStateMap = new wm<object, IObjectState>();
  }

  /****************************************************************************************/

  private reSplit = /^([^\\\.]|\\.)*?\./;
  private reUnescape = /\\(.)/g;

  throwPathError(): never {
    throw DEBUG ? new Error("Malformed path string") : 1;
  }

  buildAbstractStateTree(path: string, root?: IObjectState): IPropertyState {
    path += '.';
    root = root || new DeepOverrideHost.ObjectState();
    let reSplit = this.reSplit;
    let reUnescape = this.reUnescape;

    let data: IObjectState = root;
    let match: RegExpMatchArray | null;
    let matchLength: number;
    let prop: string;
    let nextData: IObjectState;
    let propData: IPropertyState | undefined;
    while (path) {
      match = reSplit.exec(path);
      if (match === null) {
        return this.throwPathError();
      }
      matchLength = match[0].length;
      prop = path.slice(0, matchLength - 1).replace(reUnescape, '$1');
      path = path.slice(matchLength);
      propData = data.ownProps[prop];
      if (!propData) {
        nextData = new DeepOverrideHost.ObjectState();
        propData = new DeepOverrideHost.PropertyState(data, prop, nextData);
        data.ownProps[prop] = propData;
      } else {
        nextData = propData.obj;
      }
      data = nextData;
    }
    if (!propData) { return this.throwPathError(); }
    return propData!;
  }

  addProperty(path: string, descriptor: ExtendedPropertyDescriptor, base?: object) {
    base = base || window;

    let baseState = new DeepOverrideHost.ObjectState();
    let terminalPropState = this.buildAbstractStateTree(path, baseState);
    terminalPropState.providedDesc = descriptor;

    this.applyObjectStateRaw(base, baseState);
  }

  /****************************************************************************************/

}

/****************************************************************************************/

abstract class DescriptorUtils {

  static isDataDescriptor(desc: PropertyDescriptor): boolean {
    return typeof desc.writable !== 'undefined'
  }

  static isAccessSideEffectDescriptor(desc:readonly<ExtendedPropertyDescriptor>): boolean {
    return 'beforeGet' in desc || 'beforeSet' in desc;
  }

  private static readonly DESC_KEYS = ["configurable", "enumerable", "value", "get", "set", "writable"];
  private static readonly GENERIC_DESC_KEYS = DescriptorUtils.DESC_KEYS.slice(0, 2);

  // Helper function to be used for functions that clones property descriptors
  private static copyProperties(from:object, to:object, keys:string[]) {
    for (let i = 0, l = keys.length; i < l; i++) {
      let key = keys[i];
      if (key in from) {
        to[key] = from[key];
      }
    }
  }

  static cloneDesc(desc: readonly<PropertyDescriptor> | undefined): PropertyDescriptor | undefined {
    if (!desc) { return undefined; }
    let cloned = {};
    DescriptorUtils.copyProperties(desc, cloned, DescriptorUtils.DESC_KEYS);
    return cloned;
  }

  static cloneGenericDescKeys(from: readonly<PropertyDescriptor>, to:PropertyDescriptor) {
    DescriptorUtils.copyProperties(from, to, DescriptorUtils.GENERIC_DESC_KEYS);
  }

  static invokeGetter(desc: PropertyDescriptor, receiver) {
    if (DescriptorUtils.isDataDescriptor(desc)) {
      return desc.value;
    }
    if (desc.get) { return desc.get.call(receiver); }
  }

  /**
   * Returned value indicates whether the [[Set]] has succeeded.
   *
   * @todo Sometimes we need to throw appropriate errors.
   * We need to consider whether this should be thrown from this.
   */
  static invokeSetter(desc:PropertyDescriptor, value, receiver):boolean {
    if (DescriptorUtils.isDataDescriptor(desc)) {
      if (desc.writable) {
        desc.value = value;
        return true;
      } else {
        return false;
      }
    }
    if (!desc.set) { return false; }
    // ToDo, should check errors here?
    desc.set.call(receiver, value);
    return true;
  }

  /**
   * Creates a property descriptor to be defined on an object on [[Set]] operation
   * when the receiver didn't own the property.
   * {@link http://www.ecma-international.org/ecma-262/7.0/#sec-ordinaryset}
   */
  static getPropertyWriteDescriptor(value):PropertyDescriptor {
    return {
      value: value,
      configurable: true,
      writable: true,
      enumerable: true
    };
  }

  static defineProperty = defineProperty;
  static getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  static isExtensible = Object.isExtensible;
  static getPrototypeOf = Object.getPrototypeOf;

  static hasOwnProperty = Object.prototype.hasOwnProperty;
  static isPrototypeOf = Object.prototype.isPrototypeOf;

  // Object#__lookupGetter__ is not supported on IE10 and lower.
  static lookupGetter = Object.prototype.__lookupGetter__ || function (prop: PropertyKey) {
    let desc = DescriptorUtils.lookupDescriptor(this, prop);
    return desc && desc.get ? desc.get : undefined;
  };
  static lookupSetter = Object.prototype.__lookupSetter__ || function (prop: PropertyKey) {
    let desc = DescriptorUtils.lookupDescriptor(this, prop);
    return desc && desc.set ? desc.set : undefined;
  };

  private static lookupDescriptor = (obj: object, prop: PropertyKey): PropertyDescriptor | undefined => {
    if (!(prop in obj)) { return; }
    while (!DeepOverrideHost.hasOwnProperty.call(obj, prop)) {
      obj = DescriptorUtils.getPrototypeOf(obj);
    }
    return DescriptorUtils.getOwnPropertyDescriptor(obj, prop);
  }

  static isExpando = (obj: any): boolean => {
    let type = typeof obj;
    if (type === 'function') { return true; }
    if (type === 'object' && obj !== null) { return true; }
    return false;
  }
}


/****************************************************************************************/




/****************************************************************************************/
/****************************************************************************************/

let overrider: DeepOverrideHost;

declare var _return;

_return = (path: string, descriptor: ExtendedPropertyDescriptor, base?: object): void => {
  if (!overrider) { overrider = new DeepOverrideHost(); }
  overrider.addProperty(path, descriptor, base);
}

/****************************************************************************************/
/****************************************************************************************/
/****************************************************************************************/
