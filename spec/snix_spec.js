describe("Snix", function(){

  describe("value", function(){

    it("returns a function", function(){
      expect(typeof(Snix.val())).toBe("function");
    });

    it("serializes the underlying as json", function(){

      expect(JSON.stringify(Snix.val(100))).toBe("100");
      expect(JSON.stringify(Snix.val("joe"))).toBe('"joe"');

      expect(JSON.stringify(Snix.val({name: "joe"}))).toBe('{"name":"joe"}');

      var obj = {name: "joe"};
      obj.toJSON = function(){
        return {"NAME": this.name};
      };

      expect(JSON.stringify(Snix.val(obj))).toBe('{"NAME":"joe"}');
    });

    describe("reading underlying value", function(){
      it("returns value when called without any argument", function(){
        expect(Snix.val()()).toBeNull();
        expect(Snix.val(100)()).toBe(100);
      });
    });

    describe("update underlying value", function(){

      it("uses the first argument as new value", function(){
        var v = Snix.val();
        expect(v(100)()).toBe(100);
      });

      it("returns self", function(){
        var v = Snix.val();
        expect(v(100)).toBe(v);
      });

      it("passes the new value through convert", function(){
        var v = Snix.val();

        spyOn(v, "convert").andCallThrough();
        v(100);

        expect(v.convert).toHaveBeenCalledWith(100);
      });

      it("sets a new value only if it differs from the current value", function(){
        var v = Snix.val();
        
        spyOn(v, "isDifferentValue").andReturn(true);
        v(1);
        expect(v.isDifferentValue).toHaveBeenCalledWith(1);
        expect(v()).toBe(1);
      });

      it("does not update the underlying value if isDifferentValue returns false", function(){
        var v = Snix.val();

        v(2);

        spyOn(v, "isDifferentValue").andReturn(false);

        v(3);
        expect(v.isDifferentValue).toHaveBeenCalledWith(3);
        expect(v()).toBe(2);
      });
    });

    describe("events", function(){

      it("invokes change-listener when the underlying value changes", function(){
        var listener = jasmine.createSpy("change listener");
        var v = Snix.val().on("change", listener);

        // should fire because initial value is NULL and 100 is different
        v(100);
        expect(listener).toHaveBeenCalledWith(100, null);

        listener.reset();

        // should only call listener if newValue != oldValue 
        v(100);
        expect(listener).not.toHaveBeenCalled();

        // should call listener because newValue != oldValue 
        v(200);
        expect(listener).toHaveBeenCalledWith(200, 100);
      });

      it("fires one events only once and removes them afterwards", function(){
        var listener = jasmine.createSpy("change listener");
        var v = Snix.val().one("change", listener);

        expect(v.__changeListener.length).toBe(1);
        
        v(100);

        expect(listener).toHaveBeenCalledWith(100, null);
        expect(v.__changeListener.length).toBe(0);
      });

      it("removes an event listener", function(){
        var listener = jasmine.createSpy("change listener");
        var v = Snix.val().on("change", listener);

        expect(v.__changeListener.length).toBe(1);

        v.off("change", listener);
        expect(v.__changeListener.length).toBe(0);
      });

    });


  });

  describe("array", function(){
    it("can be sorted", function(){

      var e1 = {name: "joe"};
      var e2 = {name: "bob"};

      var arr = Snix.array([e1, e2]);

      arr.sort("name");

      expect(arr()[0]).toBe(e2);
      expect(arr()[1]).toBe(e1);

      // switch ordering
      arr.sort("name");

      expect(arr()[0]).toBe(e1);
      expect(arr()[1]).toBe(e2);

    });

    it("triggers a change event on sorting", function(){
      var joe = {name:"joe"}, bob = {name:"bob"};
      var arr = Snix.array([joe, bob]);

      var c = Snix.compute(function(set){
        set(_.pluck(arr(),"name").join(","));
      }).subscribe(arr);

      expect(c()).toBe("joe,bob");

      arr.sort("name");

      expect(c()).toBe("bob,joe");
    });

    it("fails when calling sort without an attribute to sort on", function(){
      expect(function(){
        Snix.array().sort()
      }).toThrow("missing sort attribute");
    });

  });

  describe("enu", function(){
    it("looks up an enu entry", function(){
      var enu = Snix.enu("e1", "e2");

      var e1 = enu("e1");

      expect(e1.name).toBe("e1");

      var e11 = enu(e1);

      expect(e11.name).toBe("e1");

    });

    it("returns null when passed null as lookup argument", function(){
      var enu = Snix.enu("e1", "e2");
      expect(enu(null)).toBeNull();      
    });

    it("fails when a lookup argument can not be found in the enumeration", function(){
      var enu = Snix.enu("e1", "e2");
      expect(function(){
        enu("e3");
      }).toThrow("unknown in enumeration: e3");
    });
  });

  describe("accessor", function(){

    it("evaluate an expression", function(){
      var app = {
        name: Snix.val()
      };

      var acc = Snix.accessor("@name", app, {});

      expect(acc()()).toBeNull();
      expect(acc()("joe")()).toBe("joe");
      expect(app.name()).toBe("joe");

      app.name = Snix.val();
      expect(acc()()).toBeNull();
      expect(acc()("bob")()).toBe("bob");
      expect(app.name()).toBe("bob");
    });

  });

  describe("compute", function(){

    it("returns a function", function(){
      var c = Snix.compute(function(set){
      }, {}, {});
      expect(typeof(c)).toBe("function")
    });

    it("evaluates the passed function as sets the return value as value", function(){
      var c = Snix.compute(function(set){
        set(1);
      }, {}, {});
      expect(c()).toBe(1);
    });

    it("it lazily evaluates the passed function", function(){
      var cnt = 0;
      var c = Snix.compute(function(set){
        cnt++;
        set(10);
      }, {}, {});

      expect(cnt).toBe(0);
      expect(c()).toBe(10);
      expect(cnt).toBe(1);
    });

    it("evaluates the passed function once and memoize the result", function(){
      var cnt = 0;
      var c = Snix.compute(function(set){
        cnt++;
        set(10);
      }, {}, {});

      expect(c()).toBe(10);
      expect(cnt).toBe(1);

      expect(c()).toBe(10);
      expect(cnt).toBe(1);
    });

    it("does fail on write attempts", function(){
      var c = Snix.compute(null, {}, {});

      expect(function(){
        c(100);
      }).toThrow("compute not writable");
    });

    it("subscribe", function(){
      var v = Snix.val(10);
      var c = Snix.compute(function(set){
        set(v() * 2);
      });

      expect(c()).toBe(20);

      c.subscribe(v);
      v(20);

      expect(c()).toBe(40);

    });

    it("subscribeObject", function(){
      var v = Snix.val(10);
      var v2 = Snix.val(10);

      var c = Snix.compute(function(set){
        set(v() * v2());
      });

      expect(c()).toBe(100);

      c.subscribeObject({v: v, v2: v2});

      v(20);
      expect(c()).toBe(200);

      v2(20);
      expect(c()).toBe(400);

    });

  });

  describe("filter", function(){
    it("can filter by like", function(){
      var filter = new Snix.Filter(function(f){
        f.isLike("name");
      });

      var arr = Snix.array();
      arr.add({id: 1, name: "joe"});
      arr.add({id: 2, name: "bob"});

      var filtered = filter.filter(arr);

      expect(filtered.length).toBe(2);

      filter.name("joe");

      filtered = filter.filter(arr);

      expect(filtered.length).toBe(1);    
      expect(filtered[0]).toBe(arr()[0]);

      
      filter.name(""); // ignore empty string
      filtered = filter.filter(arr);
      expect(filtered.length).toBe(2);

      filter.name(null); // ignore null
      filtered = filter.filter(arr);
      expect(filtered.length).toBe(2);
    });

    it("can filter by in", function(){
      var filter = new Snix.Filter(function(f){
        f.isIn("name");
      });

      var arr = Snix.array();
      arr.add({id: 1, name: "joe"});
      arr.add({id: 2, name: "bob"});

      var filtered = filter.filter(arr);

      expect(filtered.length).toBe(2);

      filter.name(["joe"]);

      filtered = filter.filter(arr);

      expect(filtered.length).toBe(1);    
      expect(filtered[0]).toBe(arr()[0]);


      filter.name([]); // ignore empty array
      filtered = filter.filter(arr);
      expect(filtered.length).toBe(2);

      filter.name(null); // ignore null
      filtered = filter.filter(arr);
      expect(filtered.length).toBe(2);
    });

    it("can filter by function", function(){
      var filter = new Snix.Filter(function(f){
        f.is("age", function(val, input){
          return parseInt(input.age,10) >= parseInt(val, 10);
        });
      });

      var arr = Snix.array();
      arr.add({id: 1, name: "joe1", age: 30});
      arr.add({id: 2, name: "joe2", age: 40});
      arr.add({id: 3, name: "joe3", age: 50});

      var filtered = filter.filter(arr);
      expect(filtered.length).toBe(3);

      filter.age(30)

      filtered = filter.filter(arr);
      expect(filtered.length).toBe(3);

      filter.age(40)

      filtered = filter.filter(arr);
      expect(filtered.length).toBe(2);

      expect(filtered[0]).toBe(arr()[1]);
      expect(filtered[1]).toBe(arr()[2]);
    });

  });

  describe("utils", function(){

    it("returns the underlying value", function(){
      expect(Snix.unwrap(null)).toBeNull();
      expect(Snix.unwrap("joe")).toBe("joe");

      expect(Snix.unwrap(Snix.val())).toBe(null);
      expect(Snix.unwrap(Snix.val("joe"))).toBe("joe");
    });

    it("returns an id of the passed argument", function(){
      expect(function(){
        Snix.idOf(null)
      }).toThrow("illegal argument");

      expect(Snix.idOf(10)).toBe("10");
      expect(Snix.idOf(10.1)).toBe("10.1");
      expect(Snix.idOf("joe")).toBe("joe");
      expect(Snix.idOf({id: 100})).toBe("100");
    });

  });

  describe("types", function(){

    it("converts the passed value to an int", function(){
      expect(Snix.int(null)()).toBeNull();
      expect(Snix.int(100)()).toBe(100);
      expect(Snix.int()("100")()).toBe(100);
    });

    it("converts the passed value to a float", function(){
      expect(Snix.float(null)()).toBeNull();
      expect(Snix.float(100.1)()).toBe(100.1);
      expect(Snix.float()("100.1")()).toBe(100.1);
    });

    it("converts the passed value to a boolean", function(){
      expect(Snix.boolean(null)()).toBeNull();
      expect(Snix.boolean(true)()).toBeTruthy();
      expect(Snix.boolean(false)()).toBeFalsy();
      expect(Snix.boolean()("true")()).toBeTruthy();
      expect(Snix.boolean()("false")()).toBeFalsy();
      expect(Snix.boolean()("yes")()).toBeTruthy();
      expect(Snix.boolean()("no")()).toBeFalsy();
    });

  });

  describe("bindings", function(){

    beforeEach(function(){ $("#snix").empty(); });
    afterEach(function(){ $("#snix").empty(); });

    it("value", function(){
      var app = {name: Snix.val("joe")};

      var el = $("<input type='text' data-bind='value: @name'/>");
      $("#snix").append(el);

      Snix.refresh(app, $("#snix")[0]);

      expect($(el).val()).toBe("joe");

      el.val("bob").trigger("change");
      expect(app.name()).toBe("bob");
    });

    it("text", function(){
      var app = {name: Snix.val("joe")};

      var el = $("<span data-bind='text: @name'></span>");
      $("#snix").append(el);

      Snix.refresh(app, $("#snix")[0]);

      expect($(el).text()).toBe("joe");
    });

    it("html", function(){
      var app = {name: Snix.val("<b>joe</b>")};

      var el = $("<span data-bind='html: @name'></span>");
      $("#snix").append(el);

      Snix.refresh(app, $("#snix")[0]);

      expect($(el).html()).toBe("<b>joe</b>");
    });

    it("loop", function(){
      var entry1 = {id: 1, name: "entry1"};
      var entry2 = {id: 2, name: "entry2"};

      var app = {entries: Snix.array([
        entry1,
        entry2
      ])};

      var el = $("<ul data-bind=\"loop: {entries: @entries, as: 'entry'}\"><li><span data-bind='text: entry.name'></span></li></ul>");
      $("#snix").append(el);

      Snix.refresh(app, $("#snix")[0]);

      expect($(el).children().length).toBe(2);

      var child1 = $(el).children().toArray()[0];
      var child2 = $(el).children().toArray()[1];

      expect($(child1).attr("data-id")).toBe("1");
      expect($(child2).attr("data-id")).toBe("2");

      expect($("span", child1).text()).toBe("entry1");
      expect($("span", child2).text()).toBe("entry2");

      // remove an entry

      app.entries.remove(entry1);

      Snix.refresh(app, $("#snix")[0]);

      expect($(el).children().length).toBe(1);

      child1 = $(el).children().toArray()[0];
      expect($(child1).attr("data-id")).toBe("2");
      expect($("span", child1).text()).toBe("entry2");

      // add an entry

      app.entries.add(entry1);

      Snix.refresh(app, $("#snix")[0]);

      expect($(el).children().length).toBe(2);

      child1 = $(el).children().toArray()[0];
      child2 = $(el).children().toArray()[1];

      expect($(child1).attr("data-id")).toBe("2");
      expect($(child2).attr("data-id")).toBe("1");

      expect($("span", child1).text()).toBe("entry2");
      expect($("span", child2).text()).toBe("entry1");
    });

    it("date", function(){
      var app = {mom: Snix.moment(moment("20130101", "YYYYMMDD"))};

      var el = $("<div data-bind='date: {moment: @mom}'></div>");
      $("#snix").append(el);

      Snix.refresh(app, $("#snix")[0]);

      expect($("select.year", el).val()).toBe("2013");
      expect($("select.month", el).val()).toBe("1");
      expect($("select.day", el).val()).toBe("1");

      app.mom(null);

      Snix.refresh(app, $("#snix")[0]);

      expect($("select.year", el).val()).toBe("-1");
      expect($("select.month", el).val()).toBe("-1");
      expect($("select.day", el).val()).toBe("-1");
    });

  });

});