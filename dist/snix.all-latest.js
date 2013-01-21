"use strict";

// **Snix** is JavaScript library that helps you to create ambitious web applications. It is built around the "Reactive programming" paradigm and is heavily influenced by frameworks like Backbone, Knockout and Ember.
//
//### Features
// * **Declarative bindings** - easily connect your UI with your data model
// * **Dependency tracking** - automatically propagate changes in your data model and updates relevant parts in your UI
//
//### Modules
// * **Types** - commonly used data types (int, float, array, etc.)
// * **Bindings** - bunch of ready to use UI-bindings
// * **Binding API** - simply create your own UI-bindings

if(typeof(window) == "undefined")
  var _ = require("underscore")._;

var Snix = {};

//### Integration
// Snix uses JQuery, Underscore and Moment internally.

(function(){
  if(typeof(jQuery) != "undefined"){
    var oldClean = jQuery.cleanData;

    jQuery.cleanData = function(elems){
      for(var i=0, elem; (elem = elems[i]) !== undefined; i++ ){
        jQuery(elem).triggerHandler("destroyed");
      }
      oldClean(elems);
    };  
  }
})();

// --------------------------------
// Snix.Util
// --------------------------------

Snix.idOf = function(any){
  return ((typeof(any) == "string" || typeof(any) == "number") ? any : Snix.unwrap(any.id)).toString();
};

Snix.call = function(fun, caller, context){
  var prevCaller = Snix.__caller__;
  Snix.__caller__ = caller;
  fun.apply(context);
  Snix.__caller__ = prevCaller;
};
Snix.__caller__ = null;

Snix.unwrap = function(any){
  return any && any.__snix__ ? this.unwrap(any()) : any;
};

(function(){
  var rename = function(any, fun, visited){
    visited = visited || [];

    if(any == null || _.include(visited, any))
      return null;

    switch(typeof(any)){
      case "number":
      case "date":
      case "string":
      case "function":
      case "boolean":
        return any;
      case "object":
        visited.push(any);
        if(any instanceof Array){
          for(var i=0; i < any.length; i++){
            any[i] = rename(any[i], fun, visited);
          }
        }else{
          for(var key in any){
            var val = any[key];
            delete any[key];

            any[fun(key)] = rename(val, fun, visited);
          }
        }
        return any;
    }
  };

  Snix.toCamelCase = function(any){
    return rename(any, function(key){
      return key.replace(/(_[a-z])/g, function($1){ return $1.toUpperCase().replace("_",""); });
    });
  };

  Snix.toUnderscore = function(any){
    return rename(any, function(key){
      return key.replace(/([A-Z])/g, function($1){ return "_"+$1.toLowerCase(); });
    });
  };
  
})();


// --------------------------------
// Snix.Value
// --------------------------------

Snix.useGC = false;
Snix.logGC = false;
Snix.objectCnt = 0;

Snix.Value = function(valueProvider){

  console.info("-------- NEW");

  if(arguments.length == 0 || valueProvider === undefined)
    throw "missing valueProvider";

  var self = this;

  var runGC = function(){
    if(!self.isDisposed){
      console.info("GC ["+self.id+"]");
      var len = self.dependants.length;
      self.dependants = _.reject(self.dependants, function(dep){
        return dep.isDisposed;
      });

      if(Snix.logGC && self.dependants.length != len)
        console.info("snix gc["+self.id+"]: " + (len - self.dependants.length));

      setTimeout(runGC, 3000);
    }
  };

  if(Snix.useGC)
    setTimeout(runGC, 3000);

  // Each snix value has a unique id
  this.id = _.uniqueId();

  // Values which have this value as dependency
  this.dependants = [];
  // Has a value assigned to this
  this.isValueAssigned = false;
  // The underlying value this value object represents
  this.value = null;
  // A primitive value or function to provide a value for this
  this.valueProvider = valueProvider;

  this.isDisposed = false;

  // Stops any dependency tracking, propagation of state and release resources.
  this.dispose = function(){
    this.isDisposed = true;
    Snix.objectCnt--;

    _.each(this.dependants, function(dep){
      if(!dep.isDisposed)
        dep.dispose();
    });

    this.dependants = [];

    // if(release){
      // This value is not used by application code any more
      this.dependants = null;
      this.isValueAssigned = null;
      this.value = null;
      this.valueProvider = null;
      this.get = function(){ throw "disposed"; };
      this.set = function(){ throw "disposed"; };
    // }
  };

  // All values which depend on this value will be recomputed.
  this.triggerDependants = function(){
    var modifiedArr = [this];
    var modified = null;

    // Loop while modified values exist
    while(modified = modifiedArr.splice(0, 1)[0]){

      modified.dependants = _.reject(modified.dependants, function(e){
        return e.isDisposed == true;
      });

      // Loop for any dependant in same order as they has been added
      for(var i=0; i < modified.dependants.length; i++){
        var dep = modified.dependants[i];

        // The __caller__ depends on this - prevent "Too much recursion" errors
        if(dep == Snix.__caller__)
          continue;

        var vp = dep.valueProvider;

        // Get a new value of the dependant value
        var newValue = vp();
        if(newValue !== dep.value){
          // Update the dependants value property if the new value is not equal to the existing one
          dep.value = newValue;
          // The dependants value has changed. Add it to the list of modified values, to let the dependants of the dependant recompute as well.
          modifiedArr.push(dep);
        }
      }
    }
  };

  // Specific types (e.g. int, float, etc.) can override this method to convert the passed value as needed
  this.convert = function(value){
    return value;
  };

  // Sets the passed new value as underlying value
  this.set = function(newValue){
    // Give types a chance to convert the passed value
    newValue = this.convert(newValue);

    // Ignore new values which are equal to the existing one
    if(this.value !== newValue){
      // Update the underlying value property
      this.value = newValue;
      // A value has been assigned
      this.isValueAssigned = true;
      // Trigger all values which depends on this value
      this.triggerDependants();
    }
  };

  // Returns valueProvider as value if it is not a function, otherwise invoke valueProvider and return the result as value
  this.provideValue = function(){
    return typeof(this.valueProvider) == "function" ? this.valueProvider() : this.valueProvider;
  };

  this.trackCaller = function(){
    // Does any __caller__ exist ?
    if(Snix.__caller__){
      // __caller__ will be added to the dependants of this unless already added.
      if(!_.include(this.dependants, Snix.__caller__))      this.dependants.push(Snix.__caller__);
    }
  };

  // Returns the underlying value of this
  this.get = function(){
    // Make sure any __caller__ will be tracked 
    this.trackCaller();

    if(!this.isValueAssigned){
      // This value has not been assigned any underlying value, invoke provideValue to set one.
      this.isValueAssigned = true;
      this.set(this.provideValue());
    }

    return this.value;
  };

  this.fun = function(){
    var self = this;
    var f = function(){
      if(arguments.length == 0)   return self.get();
      else                        self.set(arguments[0]);

      return f;
    };
    f.__value__ = this;
    f.dispose = function(){
      self.dispose.apply(self, arguments);
    };
    f.__snix__ = true;
    f.toJSON = function(){
      var v = self.get();
      return (v && v.toJSON) ? v.toJSON() : v;
    };

    var subscriptions = [];

    f.subscribe = function(fun, context){
      var c = Snix.compute(function(){
        var value = self.get();
        Snix.call(function(){
          fun.apply(context, [value]);
        }, null, context);
      });
      subscriptions.push([fun, c]);
      c();
      return this;
    };

    f.unsubscribe = function(fun){
      var s = _.detect(subscriptions, function(e){
        return e[0] == fun;
      });
      s[1].dispose();
      subscriptions = _.without(subscriptions, s);
      return this;
    };

    Snix.objectCnt++;

    return f;
  };
};

//### Types

Snix.Types = {};

// **val** - use the value as is without any convert.
Snix.Types.val = function(value){
  value = arguments.length > 0 ? value : null;
  var v = new Snix.Value(value);

  return v.fun();
};

// **boolean** - converts the passed value into a boolean. true if it is true, "true" or "yes", false otherwise.
Snix.Types.boolean = function(value){
  var v = new Snix.Value(value);
  v.convert = function(val){
    return (val == null) ? null : (val == true || val == "true" || val == "yes");
  };

  return v.fun();
};

// **int** - converts the passed value into an int using parseInt.
Snix.Types.int = function(value){
  var v = new Snix.Value(value);
  v.convert = function(val){
    return (val == null) ? null : parseInt(val, 10);
  };

  return v.fun();  
};

// **float** - converts the passed value into a float using parseFloat.
Snix.Types.float = function(value){
  var v = new Snix.Value(value);
  v.convert = function(val){
    return (val == null) ? null : parseFloat(val);
  };

  return v.fun();  
};

Snix.Types.moment = function(value){
  var v = new Snix.Value(value);
  var fun = v.fun();
  
  fun.toJSON = function(){
    var val = v.get();

    if(val == null)
      return null;

    val = val.toDate();

    return (val && val.toJSON) ? val.toJSON() : val;
  };

  // v.convert = function(val){
  //   return (val == null) ? null : moment(val);
  // };

  return fun;
};

// **array** - the value will treated as an array. fails if value is not of type array. adds several array specific methods.
Snix.Types.array  = function(value){
  value = arguments.length > 0 ? value : [];

  if(!_.isArray(value))
    throw "not an array";

  var v = new Snix.Value(value);
  v.convert = function(val){
    if(!_.isArray(val))
      throw "not an array";

    return val;
  };

  var f = v.fun();

  // Adds the passed entry to the underlying array
  f.add = function(entry){
    var arr = v.get();
    arr.push(entry);

    v.triggerDependants();
  };

  // Removes the passed entry from the underlying array
  f.remove = function(entry){
    var arr = v.get();
    var newArr = _.without(arr, entry);
    v.set(newArr);
  };

  // Returns the size of the underlying array
  f.size = function(){
    return v.get().length;
  };

  // Removes all entries from the underlying array
  f.clear = function(){
    v.set([]);
  };

  // Returns true if the array contains no entries, false otherwise
  f.isEmpty = function(){
    return v.get().length == 0;
  };

  return f;
};

Snix.Types.compute = function(fun, context, opts){
  context = context || this;
  opts = _.defaults(opts || {}, {});

  var rawValueProvider = _.bind(fun, context);

  var valueProvider = function(){
    try{
      var prevCaller = Snix.__caller__;
      Snix.__caller__ = v;
      return rawValueProvider();
    }finally{
      Snix.__caller__ = prevCaller;
    }
  };

  var v = new Snix.Value(valueProvider);

  return v.fun();
};

// **enu** - a value which behaves like enumerated type in languages like java, etc. 
Snix.Types.enu = function(){
  var entries = [];

  // Loop over all arguments and create an entry (id, name) for each in this enum
  for(var i=0; i < arguments.length; i++){
    var e = {id: i, name: arguments[i].toString()};
    e.toJSON = function(){
      return this.name;
    };
    e.toString = function(){
      return this.name;
    };

    entries.push(e);
  }

  var f = function(){
    if(arguments.length == 0){
      // Returns all entries in this enum
      return entries;
    }else{
      // Find an entry in this enum which name matches the passed argument
      var entry = _.where(entries, {name: arguments[0].toString()})[0];

      // Fails if no entry is found
      if(!entry)
        throw "unknown in enumeration: " + arguments[0].toString();

      return entry;
    }
  };

  return f;
};

Snix.Types.remote = function(urlFun, valueFun){
  var v = Snix.val(null);

  valueFun = arguments.length > 1 ? valueFun : (function(data){ return data; });

  var c = Snix.compute(function(){
    var url = (typeof(urlFun) == "function" ? urlFun() : urlFun);

    if(url)
      $.getJSON(url.toString()).success(function(data){
        v(valueFun(data));
      });

    return url;
  });


  c(); // trigger trackCaller

  v.reload = function(){
    v(null);
    c.__value__.isValueAssigned = false;
    c();
  };

  return v;
};

Snix.Types.remoteArray = function(urlFun, valueFun){
  var v = Snix.array();

  valueFun = arguments.length > 1 ? valueFun : (function(data){ return data; });

  var c = Snix.compute(function(){
    var url = (typeof(urlFun) == "function" ? urlFun() : urlFun);

    if(url)
      $.getJSON(url.toString()).success(function(data){
        v(_.map(data, valueFun));
      });

    return url;
  });

  c(); // trigger trackCaller

  // force a reload
  v.reload = function(){
    v([]);
    c.__value__.isValueAssigned = false;
    c();
  };

  return v;
};

Snix.Types.validator = function(){
  var v = Snix.val({});

  v.clear = function(){
    this({});
  };

  v.validate = function(rules, context){
    var entries = {};
    for(var key in rules){
      if(!rules[key].apply(context))
        entries[key] = true;
    }
    this(entries);

    return this.isEmpty();
  };

  v.field = function(key){
    var self = this;
    return {
      isInvalid: function(){
        return self.isInvalid(key);
      }
    };
  };

  v.isInvalid = function(key){
    return this()[key] == true;
  };

  v.isEmpty = function(){
    return _.size(this()) == 0;
  };

  return v;
};

Snix.Types.app = function(fun){
  var app = {};
  fun.apply(app, [Snix]);

  $(function(){
    Snix.Binding.binden(app, $("body")[0]);
  });

  return app;
};

Snix.Types.rest = function(url, fields){
  var fun = function(data){
    data = data || {};
    for(var key in fields){
      var arr = fields[key];
      var val = data[key] === undefined ? arr[1] : data[key];

      if(val != null && arr[2])
        val = arr[2].apply(val, [val]);

      this[key] = arr[0](val);
    }

    if(typeof(this.init) == "function")
      this.init();
  };

  var listeners = {
    "create": [],
    "save": [],
    "delete": []
  };

  fun.prototype.on = function(what, fun, context){
    listeners[what].push(_.bind(fun,context||this));
    return this;
  };

  fun.prototype.nestedUrl = function(nested){
    return url + "/" + this.id() + "/" + nested;
  };

  fun.prototype.delete = function(){
    var self = this;
    Snix.delete(url+"/"+this.id())
        .success(function(res){ 
          _.each(listeners.delete, function(e){ e.apply(this, [null, res, self]); });
        })
        .error(function(){ 
          _.each(listeners.delete, function(e){ e.apply(this, [true]); });
        });
    return this;
  };

  fun.prototype.create = function(){
    var self = this;
    Snix.post(url, _.omit(_.pick(this, _.keys(fields)), "id"))
        .success(function(res){ 
          _.each(listeners.create, function(e){ e.apply(this, [null, res, self]); });
        })
        .error(function(){ 
          _.each(listeners.create, function(e){ e.apply(this, [true]); });
        });
    return this;
  };

  fun.prototype.save = function(){
    var self = this;
    Snix.put(url+"/"+this.id(), _.omit(_.pick(this, _.keys(fields)), "id"))
        .success(function(res){ 
          _.each(listeners.save, function(e){ e.apply(this, [null, res, self]); });
        })
        .error(function(){ 
          _.each(listeners.save, function(e){ e.apply(this, [true]); });
        });
    return this;
  };

  return fun;
};

Snix.hasMany = function(obj, singular, plural, newFun){
  obj[plural] = s.array();

  var initialized = false;

  obj.id.subscribe(function(newValue){
    if(newValue != null && !initialized){
      initialized = true;

      var nestedUrl = this.nestedUrl(plural);

      var onNestedDelete = function(err, data, nested){
        if(err) return alert(singular+" - delete failed");
        this[plural].remove(nested);
      };

      var createNestedKey = "create" + singular[0].toUpperCase() + singular.substring(1);

      this[createNestedKey] = newFun(nestedUrl)
        .on("create", function(err, data, nested){
          if(err) return alert(createNestedKey+" - create failed");
          this[plural].add(newFun(nestedUrl, data).on("delete", onNestedDelete,this));
        }, this);

      s.get(nestedUrl).success(function(arr){
        this[plural](_.map(arr, function(data){
          return newFun(nestedUrl, data).on("delete", onNestedDelete, this);
        }, this));
      }, this);
    }
  }, obj);
};

Snix.Types.model = function(fields){
  return function(data){
    data = data || {};
    for(var key in fields){
      var arr = fields[key];
      var val = data[key] === undefined ? arr[1] : data[key];

      if(val != null && arr[2])
        val = arr[2].apply(val, [val]);

      this[key] = arr[0](val);
    }

    if(typeof(this.init) == "function")
      this.init();
  };
};

_.each(Snix.Types, function(fun, key){
  Snix[key] = fun;
});

if(typeof(window) == "undefined") 
  module.exports = Snix;// --------------------------------
// Snix.Binding
// --------------------------------


Snix.Binding = {};


Snix.Binding.parse = function(str){
  return _.map(str.split(";"), function(s){
    var idx = s.indexOf(":");

    var key = s.substring(0, idx).replace(/\s/g, "");
    var val = s.substring(idx+1,s.length).replace(/^(\s)*/g, "");

    return [key, val];
  });
};

Snix.Binding.accessor = function(expr, context, vars){
  expr = expr.replace(/@/g, "this.");
  return function(){
    try{
      if(arguments.length == 0)   return new Function(_.keys(vars), "return " + expr).apply(context, _.values(vars));
      else                        return new Function(_.keys(vars).concat(["value"]), expr + "(value);").apply(context, _.values(vars).concat([arguments[0]]));
    }catch(e){
      if(window.console)
        window.console.error(e, expr, context, vars);
      throw "expr: " + expr + ", err: " + e;
    }
  };
};

Snix.Binding.binden = function(context, el, vars){
  vars = _.extend({}, window, arguments.length > 2 ? vars : {});

  _.each($(el).toArray(), function(el){
    var bindingAttr = $(el).attr("data-bind");

    if(bindingAttr){
      var bindingsArr = Snix.Binding.parse(bindingAttr);
      _.each(bindingsArr, function(arr){
        var bindingName = arr[0], bindingExpr = arr[1];

        var acc = Snix.Binding.accessor(bindingExpr, context, vars);
        var binding = Snix.Bindings[bindingName];

        if(!binding)
          throw "unknown binding: " + bindingName;

        var bindingContext = {context: context, vars: vars};

        if(binding.init)
          binding.init.apply(bindingContext, [el, acc]);

        if(binding.update){
          var compute = Snix.compute(function(){
            // console.info("updating: ", bindingName, bindingExpr);
            binding.update.apply(bindingContext, [el, acc]);
            return null;
          }, this);

          $(el).on("destroyed", function(){
            compute.dispose(true);
          });

          // var start = new Date().getTime();
          compute();
          // var end = new Date().getTime();

          // console.info(bindingName + "," + bindingExpr + " --- " + (end - start));
        }
      });
    }else{
      $(el).children().each(function(){
        Snix.Binding.binden(context, this, vars);
      });
    }
  });
};


// --------------------------------
// Snix.Bindings
// --------------------------------

Snix.Bindings = {};

Snix.Bindings["check"] = {
  init: function(el, accessor){
    $(el).on("change", function(){
      accessor($(el).is(":checked"));
    });
  },
  update: function(el, accessor){
    if(Snix.unwrap(accessor()))   $(el).attr("checked", "checked");
    else                          $(el).removeAttr("checked");
  }
};

Snix.Bindings["click"] = {
  init: function(el, accessor){
    $(el).on("click", function(e){
      e.preventDefault();
      accessor();
    });
  }
};

Snix.Bindings["css"] = {
  update: function(el, accessor){
    var opts = Snix.unwrap(accessor());

    for(var key in opts){
      if(opts[key]) $(el).addClass(key);
      else          $(el).removeClass(key);
    }
  }
};

Snix.Bindings["style"] = {
  update: function(el, accessor){
    var opts = Snix.unwrap(accessor());

    for(var key in opts){
      if(opts[key]) $(el).css(key, opts[key]);
      else          $(el).css(key, "");
    }
  }
};

Snix.Bindings["error"] = {
  update: function(el, accessor){
    var field = Snix.unwrap(accessor());
    if(field.isInvalid())   $(el).addClass("error");
    else                    $(el).removeClass("error");
  }
};

(function(){

  Snix.Bindings["date"] = {
    init: function(el, accessor){
      var opts = Snix.unwrap(accessor());
      opts.caption = opts.caption || {year: "Year", month: "Month", day: "Day"};

      $(el).empty();

      var now = moment();
      var entries = [["year", now.year() - 80, now.year() + 10, opts.caption.year], ["month", 1, 12, opts.caption.month], ["day", 1, 31, opts.caption.day]];

      _.each(entries, function(entry){
        var select = $("<select class='"+entry[0]+"'></select>");
        select.append("<option value='-1'>"+entry[3]+"</option>");

        for(var i=entry[1]; i<=entry[2]; i++){
          var label = (i < 10) ? ("0"+i) : i;
          $("<option value="+i+">"+label+"</option>").appendTo(select);
        }
        select.appendTo(el);

        $(select).on("change", function(){

          var year = parseInt($("select.year option:selected", el).val(), 10);
          var month = parseInt($("select.month option:selected", el).val(), 10);
          var day = parseInt($("select.day option:selected", el).val(), 10);

          if(year != -1 && month != -1 && day != -1){
            opts.moment(moment(new Date(year, month-1, day)).startOf('day'));
          }else{
            if(Snix.unwrap(opts.moment)){
              $("select option[value='-1']", el).attr("selected", "selected");
              opts.moment(null);
            }
          }

        });
      });
    },
    update: function(el, accessor){
      var opts = Snix.unwrap(accessor());
      var mom = Snix.unwrap(opts.moment);

      if(mom){
        $("select.year option[value='"+mom.year()+"']", el).attr("selected", "selected");
        $("select.month option[value='"+(mom.month()+1)+"']", el).attr("selected", "selected");
        $("select.day option[value='"+mom.date()+"']", el).attr("selected", "selected");
      }else{
        $("select option[value='-1']", el).attr("selected", "selected");
      }
    }
  };

  Snix.Bindings["datetime"] = {
    init: function(el, accessor){
      var opts = Snix.unwrap(accessor());
      opts.caption = opts.caption || {year: "Year", month: "Month", day: "Day", hour: "hh", minute: "mm"};

      $(el).empty();

      var now = moment();
      var entries = [
        ["year", now.year() - 80, now.year() + 10, opts.caption.year], 
        ["month", 1, 12, opts.caption.month], 
        ["day", 1, 31, opts.caption.day],
        ["hour", 0, 23, opts.caption.hour],
        ["minute", 0, 59, opts.caption.minute]
      ];

      _.each(entries, function(entry){
        var select = $("<select class='"+entry[0]+"'></select>");
        select.append("<option value='-1'>"+entry[3]+"</option>");

        for(var i=entry[1]; i<=entry[2]; i++){
          var label = (i < 10) ? ("0"+i) : i;
          $("<option value="+i+">"+label+"</option>").appendTo(select);
        }
        select.appendTo(el);

        $(select).on("change", function(){

          var year = parseInt($("select.year option:selected", el).val(), 10);
          var month = parseInt($("select.month option:selected", el).val(), 10);
          var day = parseInt($("select.day option:selected", el).val(), 10);
          var hour = parseInt($("select.hour option:selected", el).val(), 10);
          var minute = parseInt($("select.minute option:selected", el).val(), 10);

          if(year != -1 && month != -1 && day != -1 && hour != -1 && minute != -1){
            opts.moment(moment(new Date(year, month-1, day, hour, minute)));
          }else{
            if(Snix.unwrap(opts.moment)){
              $("select option[value='-1']", el).attr("selected", "selected");
              opts.moment(null);
            }
          }

        });
      });
    },
    update: function(el, accessor){
      var opts = Snix.unwrap(accessor());
      var mom = Snix.unwrap(opts.moment);

      if(mom){
        $("select.year option[value='"+mom.year()+"']", el).attr("selected", "selected");
        $("select.month option[value='"+(mom.month()+1)+"']", el).attr("selected", "selected");
        $("select.day option[value='"+mom.date()+"']", el).attr("selected", "selected");
        $("select.hour option[value='"+mom.hours()+"']", el).attr("selected", "selected");
        $("select.minute option[value='"+mom.minutes()+"']", el).attr("selected", "selected");
      }else{
        $("select option[value='-1']", el).attr("selected", "selected");
      }
    }
  };

})();



Snix.Bindings["log"] = {
  update: function(el, accessor){
    if(window.console)
      window.console.log(Snix.unwrap(accessor()));
  }
};

Snix.Bindings["loop"] = {
  init: function(el, accessor){
    this.tpl = $(el).html();
    $(el).empty();
  },
  update: function(el, accessor){
    var opts = accessor();
    var entries = Snix.unwrap(opts.entries);

    var ids = _.map(entries, function(e){ 
      var id = Snix.idOf(e);

      if(!id)
        throw "loop expects an id attribute for each entry";

      return id;
    });
    var elIds = $("> [data-id]", el).map(function(){ return $(this).attr("data-id"); }).toArray();

    if(ids.length == elIds.length && ids.toString() != elIds.toString()){
      // same element but different sorting
      $(el).empty();
    }

    // TODO: $(el).empty(); does not refresh elIds - optimize

    if(elIds.length > 0){
      // remove dom elements bound to object which no longer exist
      var removeSelector = _(elIds).chain().difference(ids).map(function(e){ return "[data-id='"+e+"']"; }).value().join(",");
      $(removeSelector, el).remove();
    }

    _.each(ids, function(id){
      if(!_.include(elIds, id)){
        // create dom elements
        var entry = _.detect(entries, function(e){ return Snix.idOf(e) == id; });

        var child = $(this.tpl);
        child.attr("data-id", id);
        child.appendTo(el);

        var newVars = _.defaults({}, this.vars);
        newVars[opts.as] = entry;

        Snix.call(function(){
          Snix.Binding.binden(this.context, child, newVars);
        }, null, this);
      }

    }, this);
  }
};

Snix.Bindings["radio"] = {
  init: function(el, accessor){
    var opts = accessor();

    $(el).on("change", function(){
      var selectedId = $(this).attr("data-id");
      opts.selected(_.detect(Snix.unwrap(opts.entries), function(e){ return Snix.idOf(e) == selectedId; }));
    });

    $(el).attr("data-id", Snix.idOf(opts.entry));
  },
  update: function(el, accessor){
    var opts = accessor();
    var selected = Snix.unwrap(opts.selected);

    if(selected){
      $(el).parents("form").find("input[name='"+$(el).attr("name")+"'][data-id='"+Snix.idOf(selected)+"']").attr("checked", "checked");
    }else{
      $(el).parents("form").find("input[name='"+$(el).attr("name")+"']").removeAttr("checked");
    }
  }
};

Snix.Bindings["radioset"] = {
  init: function(el, accessor){
    var opts = accessor();

    $(el).addClass("snix").addClass("radioset");

    this.tpl = "<ul>";
    var name = "snix_"+_.uniqueId();

    _.each(opts.entries(), function(e){
      this.tpl += "<li>";
      this.tpl += "<input type='radio' name='"+name+"' data-bind=\"radio: {entries: entries(), selected: selected, entry: entries('"+e.toString()+"')}\" />";
      this.tpl += "<label>"+e.toString()+"</label>";
      this.tpl += "</li>";
    }, this);

    this.tpl += "</ul>";
  },
  update: function(el, accessor){
    var opts = accessor();
    $(el).empty()

    var child = $(this.tpl);
    child.appendTo(el);

    var newVars = _.defaults({}, this.vars);
    newVars["entries"] = opts.entries;
    newVars["selected"] = opts.selected;

    Snix.call(function(){
      Snix.Binding.binden(this.context, child, newVars);
    }, null, this);    
  }
};

//##Select##
//
// The Select-binding manages the select element, creates the appropriate option elements for the data model, an empty "please choose" option which is selected by default and when the user chooses an option, this will be set in the data model.
//
//###Example###
//
// var app = {<br/>
// todos: Snix.array([<br/>
// &nbsp;&nbsp;{id: 1, name: 'todo1'},<br/>
// &nbsp;&nbsp;{id: 2, name: 'todo2'},<br/>
// &nbsp;&nbsp;{id: 3, name: 'todo3'}<br/>
// ]),<br/>
// selectedTodo: Snix.val(null)<br/>
// };
//
// &lt;select data-bind="select: {entries: @todos, label: 'name', caption: 'Please choose a todo', selected: @selectedTodo}"&gt;&lt;/select&gt;
Snix.Bindings["select"] = {
  init: function(el, accessor){
    var opts = accessor();

    if(opts.multiple)
      $(el).attr("multiple", "multiple");

    $(el).on("change", function(){
      // var selectedIds = _.map($("option:selected", el).toArray(), function(e){ return $(e).attr("value"); });

      if(opts.multiple){
        var selectedIds = _.map($("option:selected", el).toArray(), function(e){ return $(e).attr("value"); });

        if(selectedIds.length == 0)   opts.selected([]);
        else                          opts.selected(_.select(Snix.unwrap(opts.entries), function(e){ return _.include(selectedIds, Snix.idOf(e)); }));
      }else{
        var selectedId = $("option:selected", el).attr("value");

        if(selectedId == "-1")  opts.selected(null);
        else                    opts.selected(_.detect(Snix.unwrap(opts.entries), function(e){ return Snix.idOf(e) == selectedId; }));
      }
    });
  },
  update: function(el, accessor){
    var opts = accessor();
    $(el).empty();

    if(!opts.multiple){
      var caption = Snix.unwrap(opts.caption) || "Please Choose";
      $("<option value='-1'>"+caption+"</option>").appendTo(el);
    }

    var labelKey = Snix.unwrap(opts.label);

    _.each(Snix.unwrap(opts.entries), function(e){
      var label = (labelKey ? Snix.unwrap(e[labelKey]) : e.toString());
      $("<option value='"+Snix.idOf(e)+"'>"+label+"</option>").appendTo(el);
    });

    var selected = Snix.unwrap(opts.selected);

    if(opts.multiple){ // array
      if(selected) 
        _.each(selected, function(e){
          $("option[value='"+Snix.idOf(e)+"']", el).attr("selected", "selected");
        });
    }else{ // object
      if(selected)  $("option[value='"+Snix.idOf(selected)+"']", el).attr("selected", "selected");
      else          $("option[value='-1']", el).attr("selected", "selected");
    }

  }
};

//##Text##
//
// The Text-binding sets the text attribute of the element to the underlying value of the data model.
//
//###Example###
//
// var app = {name: Snix.val("joe")};
//
// &lt;span data-bind="text: @name"&gt;&lt;/span&gt;
Snix.Bindings["text"] = {
  update: function(el, accessor){
    $(el).text(Snix.unwrap(accessor()));
  }
};

Snix.Bindings["html"] = {
  update: function(el, accessor){
    $(el).html(Snix.unwrap(accessor()));
  }
};

Snix.Bindings["on"] = {
  init: function(el, accessor){
    var events = accessor();
    var self = this;

    for(var key in events){
      $(el).on(key, function(){
        events[key].apply(self.context, [this]);
      });
    }
  }
};

//##Toggle##
//
// The Toggle-binding will toggle the element. Shows it if the value in data model is truthy, hides it otherwise. On hide the children of the element will be removed and recreated on show.
//
//###Example###
//
// var app = {complete: Snix.boolean(true)};
//
// &lt;div data-bind="toggle: @complete() == true"&gt;&lt;span&gt;hello from snix&lt;/span&gt;&lt;/div&gt;
Snix.Bindings["toggle"] = {
  init: function(el, accessor){
    this.tpl = $(el).html();
  },
  update: function(el, accessor){
    if(Snix.unwrap(accessor())){
      $(el).empty().show();

      var child = $(this.tpl);
      child.appendTo(el);

      var newVars = _.defaults({}, this.vars);

      Snix.call(function(){
        Snix.Binding.binden(this.context, child, newVars);
      }, null, this);
    }else{
      $(el).hide().empty();
    }
  }
};

Snix.Bindings["visible"] = {
  update: function(el, accessor){
    $(el).toggle(Snix.unwrap(accessor()) == true);
  }
};

Snix.Bindings["upload"] = {
  init: function(el, accessor){
    var opts = accessor();

    $(el)
      .attr("name", "file")
      .attr("data-url", Snix.unwrap(opts.url))
      .fileupload({
        dataType: "json",
        done: (opts.done || (function(){}))
      });
  }
};

//##Value##
//
// The Value-binding sets the value attribute of the element to the underlying value of the data model. Changing the elements value will update the data model as well.
//
//###Example###
//
// var app = {name: Snix.val("joe")};
//
// &lt;input type="text" data-bind="value: @name"/&gt;
Snix.Bindings["value"] = {
  init: function(el, accessor){
    $(el).on("change", function(){
      accessor($(this).val());
    });
  },
  update: function(el, accessor){
    $(el).val(Snix.unwrap(accessor()));
  }
};// --------------------------------
// Snix.Ajax
// --------------------------------

(function(){

  var wrapper = function(ajax){
    return {
      success: function(fun, context){
        ajax.success(_.bind(fun, context||this));
        return this;
      },
      error: function(fun, context){
        ajax.error(_.bind(fun, context||this));
        return this;
      }
    };
  };

  Snix.get = function(url){
    var ajax = $.ajax({
      type: "GET", 
      url: url
    });

    return wrapper(ajax);
  };

  Snix.post = function(url, data, wrapData){
    var data = JSON.stringify(data ? data : {});
    var ajax = $.ajax({
      type: "POST", 
      url: url, 
      data: (wrapData ? {data: data} : data), 
      dataType: "json"
    });
    return wrapper(ajax);
  };  

  Snix.put = function(url, data){
    var data = JSON.stringify(data ? data : {});
    var ajax = $.ajax({
      type: "POST", 
      url: url, 
      data: {data: data, _method: "PUT"},
      dataType: "json"
    });
    return wrapper(ajax);
  };  

  Snix.patch = function(url, data){
    var data = JSON.stringify(data ? data : {});
    var ajax = $.ajax({
      type: "POST", 
      url: url, 
      data: {data: data, _method: "PATCH"},
      dataType: "json"
    });
    return wrapper(ajax);
  };  

  Snix.delete = function(url, data){
    var ajax = $.ajax({
      type: "POST", 
      url: url,
      data: {_method: "DELETE"}
    });
    return wrapper(ajax);
  };  

})();

Snix.record = function(RecordFun){
  var v = Snix.val();

  v.newRecord = function(){
    v(new RecordFun);
  };

  v.find = function(id){
    var r = RecordFun.find(id);

    r.subcribe(function(newValue){
      v(newValue);
    });
  };

  return v;
}

Snix.Record = function(baseUrl, attributes){

  var hasManyEntries = {};

  var RecordFun = function(data, parent){
    this.id = s.val();

    this.canCreate = s.compute(function(){
      return this.id() == null;
    }, this);

    this.canSave = s.compute(function(){
      return this.id() != null;
    }, this);

    this.canDelete = s.compute(function(){
      return this.id() != null;
    }, this);

    this.url = s.compute(function(){
      return (parent != null ? parent.url() : "") + baseUrl + "/" + this.id();
    }, this);

    this.urlCreate = s.compute(function(){
      return (parent != null ? parent.url() : "") + baseUrl;
    }, this);

    var listener = {
      create: [],
      save: [],
      delete: []
    };  

    this.on = function(op, fun, context){
      listener[op].push(_.bind(fun, context||this));
    };

    var attributeNames = _.keys(attributes);

    this.delete = function(){
      var ajax = $.ajax({
        type: "POST", 
        url: this.url(),
        data: {_method: "DELETE"}
      }).success(function(){ _.invoke(listener["delete"], "call", null); })
        .error(function(err){ alert(err); });

      // s.delete(this.url())
      //   .success(function(){ _.invoke(listener["delete"], "call", null); })
      //   .error(function(err){ alert(err); });

      return this;
    };

    this.save = function(){
      var data = JSON.stringify(_.pick(this, attributeNames));
      var ajax = $.ajax({
        type: "POST", 
        url: this.url(), 
        data: {data: data, _method: "PUT"},
        dataType: "json"
      }).success(function(){ _.invoke(listener["save"], "call", null); })
        .error(function(err){ alert(err); });


      // s.put(this.url(), _.pick(this, attributeNames))
      //   .success(function(){ _.invoke(listener["save"], "call", null); })
      //   .error(function(err){ alert(err); });

      return this;
    };

    this.create = function(){
      var self = this;

      var data = JSON.stringify(_.pick(this, attributeNames));
      var ajax = $.ajax({
        type: "POST", 
        url: url, 
        data: data, 
        dataType: "json"
      }).success(function(res){ 
          self.id(res["id"]); 
          _.invoke(listener["create"], "call", null);
        }, this)
        .error(function(err){ alert(err); });


      // s.post(this.urlCreate(), _.pick(this, attributeNames))
      //   .success(function(res){ 
      //     this.id(res["id"]); 
      //     _.invoke(listener["create"], "call", null);
      //   }, this)
      //   .error(function(err){ alert(err); });

      return this;
    };


    data = data || {};

    if(data.id)
      this.id(data.id);

    for(var key in attributes){
      var arr = attributes[key];
      var val = data[key] === undefined ? arr[1] : data[key];

      if(val != null && arr[2])
        val = arr[2].apply(val, [val]);

      this[key] = arr[0](val);
    }

    for(var key in hasManyEntries){
      var ManyRecordFun = hasManyEntries[key];

      this[key] = s.array();

      var self = this;
      this[key].load = function(){
        s.get(self.url() + ManyRecordFun.baseUrl).success(function(data){
          self[key](_.map(data, function(e){ return new ManyRecordFun(e, self); }));
        }, this).error(function(err){
          alert("err: " + err);
        });
        return this;
      };

      this[key].reload = function(){
        this([]);
        return this.load();
      };
    }
  };

  RecordFun.all = function(lazy){
    var res = s.array();

    res.load = function(){
      var self = this;
      s.get(baseUrl).success(function(data){
        self(_.map(data, function(e){ return new RecordFun(e); }));
      }).error(function(err){
        alert("err: " + err);
      });
      return this;
    };

    res.reload = function(){
      this([]);
      return this.load();
    };

    if(!lazy)
      res.load();

    return res;
  };

  RecordFun.find = function(id){
    var res = s.val();

    res.load = function(){
      var self = this;
      s.get(baseUrl).success(function(data){
        self(new RecordFun(data));
      }).error(function(err){
        alert("err: " + err);
      });
      return this;
    }

    res.reload = function(){
      this(null);
      return this.load();
    };

    res.load();

    return res;
  };

  RecordFun.hasMany = function(name, RecordFun){
    hasManyEntries[name] = RecordFun;
  };

  // RecordFun.hasOne = function(name, RecordFun){
  //   hasManyEntries[name] = RecordFun;
  // };

  RecordFun.baseUrl = baseUrl;

  return RecordFun;
};