$.fn.serializeObject = function() {
    var o = {};
    var a = this.serializeArray();
    $.each(a, function() {
        if (o[this.name]) {
            if (!o[this.name].push) {
                o[this.name] = [o[this.name]];
            }
            o[this.name].push(this.value || '');
        } else {
            o[this.name] = this.value || '';
        }
    });
    return o;
};

;(function (root, factory) {

    if (typeof define === 'function' && define.amd) {
        define(factory);
    } else if (typeof exports === 'object') {
        module.exports = factory();
    } else {
        root.Slideshow = factory();
    }

})(this, function () {

    var Slideshow = {};
        Slideshow.version = '0.1.0';

    var Dict = Slideshow.dict = {};
    var Instance = Slideshow.instance = undefined;
    var Settings = Slideshow.settings = {
        selector    : ".slideshow",
        timeout     : "5000ms", // default timeout
        autoplay    : true,
        max         : -1,
        transition  : "opacity",
        tick        : "500ms",
        keyControl  : undefined,
        clickControl: undefined,
        focus       : true,
        autocomplete: undefined
    };

    const State = Slideshow.state = {
        PLAY         : "play",
        SHOW         : "show",
        PREVENT      : "prevent", // Prevent going to this image
        EMPTY        : "empty",
        ACTIVE       : "active",  // Overhead time until animation ends
        TIMEOUT      : "timeout", // Force slideshow time reset (when clicking on backward or forward button)
       
        REWIND       : "rewind",   // Reset to initial slide and keep current state (pause or play)
        FASTBACKWARD : "fast-backward",
        BACKWARD     : "backward",
        FORWARD      : "forward",
        FASTFORWARD  : "fast-forward",
    };

    const Key = Slideshow.key = {

        LEFT : 37,
        UP   : 38,
        RIGHT: 39,
        DOWN : 40,

        SHIFT : 16,
    }

    var debug = false;
    var ready = false;

    Slideshow.parseDuration = function(str) { 

        var array = String(str).split(", ");
            array = array.map(function(t) {

                if(String(t).endsWith("ms")) return parseFloat(String(t))/1000;
                return parseFloat(String(t));    
            });

        return Math.max(...array);
    }

    Slideshow.get = function(key) {
    
        if(key in Slideshow.settings) 
            return Slideshow.settings[key];

        return null;
    };

    Slideshow.set = function(key, value) {
    
        Slideshow.settings[key] = value;
        return this;
    };

    Slideshow.add = function(key, value) {
    
        if(! (key in Slideshow.settings))
            Slideshow.settings[key] = [];

        if (Slideshow.settings[key].indexOf(value) === -1)
            Slideshow.settings[key].push(value);

        return this;
    };

    Slideshow.remove = function(key, value) {
    
        if(key in Slideshow.settings) {
        
            Slideshow.settings[key] = Slideshow.settings[key].filter(function(setting, index, arr){ 
                return value != setting;
            });

            return Slideshow.settings[key];
        }
        
        return null;
    };

    Slideshow.configure = function (options) {

        var key, value;
        for (key in options) {
            value = options[key];
            if (value !== undefined && options.hasOwnProperty(key)) Settings[key] = value;
        }

        if(debug) console.log("Slideshow configuration: ", Settings);

        return this;
    };

    Slideshow.isReady = function() { return ready; }

    Slideshow.uuidv4 = function() {
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
          (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    };

    Slideshow.ready = function (options = {}) {

        if("debug" in options)
            debug = options["debug"];

        Slideshow.configure(options);
        ready = true;

        if(debug) console.log("Slideshow is ready.");
        dispatchEvent(new Event('slideshow:ready'));

        if (Slideshow.empty())
            Slideshow.onLoad();

        Slideshow.run(function() {

            if (Slideshow.get("autoplay")) {
                
                $(Slideshow.get("selector")).each(function() {
                    if($(this).hasClass("active") || $(this).hasClass("play")) Slideshow.play(this);
                });
            }
        });

        return this;
    };

    Slideshow.empty  = function() { return Object.keys(Slideshow.dict).length === 0; } 
    Slideshow.clear  = function() 
    {
        $(Slideshow.dict).each(function(id) {

            if (this.observer !== undefined) 
                this.observer.disconnect();
        });

        Slideshow.dict = {}; 
    }
    Slideshow.onLoad = function(selector = Slideshow.get("selector")) {

        Slideshow.clear();
        $(selector).each(function() {

            this.id = this.id || Slideshow.uuidv4();
            Slideshow.dict[this.id] = {
                container: this, instance: undefined, transitions: undefined, transitions_default: undefined,
                observer:undefined, first:undefined, last:undefined, onHold:false,
                progress:0, timeout: undefined, isHover:false, isSelected: false};

            var entries = $(this).find(".slideshow-entry");
            if(entries.length < 1) $(this).addClass(Slideshow.state.EMPTY);
            else $(this).addClass(Slideshow.state.REMOVE);

            var observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    var attributeValue = $(mutation.target).prop(mutation.attributeName);
                    console.log("Slideshow "+mutation.target.id+" changed to:", attributeValue);
                });
            });

            if(debug > 1) observer.observe(this, { attributes: true, attributeFilter: ['class']});

            Slideshow.run(function() {

                if (Slideshow.get("autoplay"))
                    Slideshow.play(this);

            }.bind(this));
        });

        if(debug) {
            
            var slideshows = Slideshow.length(selector);
            if (slideshows.length < 1) console.log("Slideshow: no slideshow found");
            else {

                console.log("Slideshow: " + slideshows.length + " slideshow(s) found");
                $(slideshows).each(function(index) { console.log("- Slider #"+(index+1)+" ("+ this + " image(s) found)", $(selector)[index] ); });
            }
        }
    }

    Slideshow.call = function(
        entry, 
        that = undefined /* slideshow container (default class naming might be different that ."slideshow") */
    ) {

        if(!$(entry).hasClass("slideshow-entry")) {
            console.error("Failed to load entry..", entry, " no class \"slideshow-entry\" found");
            return undefined;
        }

        var image = $(entry).find(".slideshow-image")[0] || undefined;
        if (image !== undefined) return entry;
        
        image = document.createElement("img");
        image.setAttribute("class", "slideshow-image");
        image.setAttribute("src", entry.dataset.image);
        
        var href  = entry.dataset.href || undefined;
        if (href === undefined) entry.prepend(image);
        else {

            var link = document.createElement("a");
                link.append(image);
                link.setAttribute("href", href);
                link.setAttribute("class", "slideshow-link");

            entry.prepend(link);
        }

        if(that) {

            //
            // OPTIONAL: On click control
            //
            
            $(image).on("click", function() {

                var clickControl = that.dataset.clickControl || Slideshow.get("clickControl");
                if (clickControl) {

                    Slideshow.forward(that.container);
                    Slideshow.run(that.container);
                }
            });

            //
            // OPTIONAL: Compute pagers
            //
            var pager = $(that).find(".slideshow-pager");
            var pagerPrototype = pager.map(function() { return new DOMParser().parseFromString(this.dataset.prototype, "text/xml").firstChild; });
            
            var thumbnail = entry.dataset.image.replace(/(\.[\w\d_-]+)$/i, '_thumbnail$1');
            $(pager).each(function(i) {

                var prototype = pagerPrototype[i];
                var ith = $(this).children().length;
                
                $(prototype).find(".slideshow-thumbnail").each(function(i) {
                    this.setAttribute("src", thumbnail); 
                    $(this).on("click", function() { Slideshow.goto(that, ith); });
                });

                $(prototype).find(".slideshow-progress").each(function(i) {
                    $(this).on("click", function() { 
                        if($(this).hasClass(Slideshow.state.PREVENT)) {
                            Slideshow.goto(that, ith); 
                            Slideshow.run(that.container);
                        }
                    });
                });

                $(this).append(prototype);
            });
        }

        return entry;
    }
    
    Slideshow.asleep = function() {

        var asleep = true;
        Object.keys(Slideshow.dict).forEach(function(id) {
            asleep  &= !$(Slideshow.dict[id].container).hasClass(Slideshow.state.PLAY) 
                    && !$(Slideshow.dict[id].container).hasClass(Slideshow.state.TIMEOUT) 
                    && !$(Slideshow.dict[id].container).hasClass(Slideshow.state.ACTIVE) 
        });

        return asleep;
    }

    Slideshow.run = function(callback = function() {}) {

        if(!Slideshow.isReady()) return;

        Slideshow.update();

        callback();

        if (Slideshow.instance !== undefined) return;
        if(debug > 1) console.log("[MASTER]","New call");

        var focus = Slideshow.get("focus");
        var focusList = [];
        Slideshow.instance = setInterval(function() {

            if(debug > 1) console.log("[MASTER]","Next iteration");
            Object.keys(Slideshow.dict).forEach(function(id) { 

                var that = Slideshow.dict[id];
                if(Slideshow.get("focus") != focus) {
                    
                    if(Slideshow.get("focus") == false) {
                    
                        focusList.push(that.container.classList);
                        Slideshow.pause(that);

                    } else {

                        while(( selector = focusList.pop() ))
                            Slideshow.play(selector);
                    }
                }

                if(debug > 1) console.log("[SLAVE] ","State", that.container.classList);
                if($(that.container).hasClass(Slideshow.state.ACTIVE) || $(that.container).hasClass(Slideshow.state.TIMEOUT)) {
                
                    $(that.container).removeClass(Slideshow.state.TIMEOUT);
                    if (that.interval !== undefined) {

                        if(debug > 1) console.log("[SLAVE] ","Pause transition",id);
                        clearInterval(that.interval);
                        that.interval = undefined;
                    }

                } else if ($(that.container).hasClass(Slideshow.state.PLAY)) {

                    Slideshow.updateProgress(that.container);

                    if (that.interval === undefined) {

                        if(debug > 1) console.log("[SLAVE] ","New call",id);
                        Slideshow.handleNavigation(that.container);
                        $(that.container).removeClass(Slideshow.state.TIMEOUT)

                        that.interval = setInterval(function() { 

                            if(debug > 1) console.log("[SLAVE] ","Next iteration",id);
                            Slideshow.forward(that.container);
                            Slideshow.update(that.container); 

                        }.bind(that), that.timeout || 1000*Slideshow.parseDuration(Slideshow.get("timeout")));

                    } else if ($(that.container).hasClass(Slideshow.state.TIMEOUT)) {

                        if (that.interval !== undefined) {
    
                            if(debug > 1) console.log("[SLAVE] ","Reset",id);
                            clearInterval(that.interval);
                            that.interval = undefined;
                        }
                        
                    } 

                } else if (that.interval !== undefined) {

                    if(debug > 1) console.log("[SLAVE] ","Fullstop",id);
                    clearInterval(that.interval);
                    that.interval = undefined;
                }
            });

            if(Slideshow.asleep() && Slideshow.instance != undefined) {

                if(debug > 1) console.log("[MASTER]","Fullstop");
                clearInterval(Slideshow.instance);
                Slideshow.instance = undefined;
            }

        }, 1000*Slideshow.parseDuration(Slideshow.get("tick")));
    }

    Slideshow.lastSelection = undefined;
    Slideshow.handleNavigation = function(selector = Slideshow.get("selector"))
    {
        return $(Slideshow.find(selector)).map(function() { 

            var that = this;
            $(this).find(".slideshow-fast-backward").off("click");
            $(this).find(".slideshow-fast-backward").on ("click", function() {
                Slideshow.fastBackward(that);
                Slideshow.run();
            });
            $(this).find(".slideshow-backward").off("click");
            $(this).find(".slideshow-backward").on ("click", function() {
                Slideshow.backward(that);
                Slideshow.run();
            });
            $(this).find(".slideshow-pause").off("click");
            $(this).find(".slideshow-pause").on ("click", function() {
                Slideshow.pause(that);
                Slideshow.run();
            });
            $(this).find(".slideshow-play").off("click");
            $(this).find(".slideshow-play").on ("click", function() {
                Slideshow.play(that);
                Slideshow.run();
            });
            $(this).find(".slideshow-stop").off("click");
            $(this).find(".slideshow-stop").on ("click", function() {
                Slideshow.pause(that);
                Slideshow.rewind(that);
                Slideshow.run();
            });
            $(this).find(".slideshow-forward").off("click");
            $(this).find(".slideshow-forward").on ("click", function() {
                Slideshow.forward(that);
                Slideshow.run();
            });
            $(this).find(".slideshow-fast-forward").off("click");
            $(this).find(".slideshow-fast-forward").on ("click", function() {
                Slideshow.fastForward(that);
                Slideshow.run();
            });

            $(this).off("mouseenter.slideshow."+this.id);
            $(this).on ("mouseenter.slideshow."+this.id, function(){ if(that.id in Slideshow.dict) Slideshow.dict[that.id].isHover = true; });
            $(this).off("mouseover.slideshow." +this.id);
            $(this).on ("mouseover.slideshow." +this.id, function(){ if(that.id in Slideshow.dict) Slideshow.dict[that.id].isHover = true; });
            $(this).off("mouseleave.slideshow."+this.id);
            $(this).on ("mouseleave.slideshow."+this.id, function(){ if(that.id in Slideshow.dict) Slideshow.dict[that.id].isHover = false; });

            $(this).on("click.slideshow."+this.id, function(event) {
                Object.entries(Slideshow.dict).forEach(([k,v]) => { v.isSelected = (k == that.id); });
            });

            $(document).off("keydown.slideshow."+this.id);
            $(document).on ("keydown.slideshow."+this.id, function(e) {

                if(Slideshow.dict[that.id] === undefined) return;
                if(!Slideshow.dict[that.id].isSelected && !Slideshow.dict[that.id].isHover) return;

                var isHover = Slideshow.dict[that.id].isHover;
                var keyControl = that.dataset.keyControl || Slideshow.get("keyControl");
                if (keyControl === true || (keyControl === undefined && isHover)) {
    
                    if(e.which == Slideshow.key.LEFT) {
                        Slideshow.backward(that);
                        Slideshow.run();
                    } else if(e.which == Slideshow.key.RIGHT) {
                        Slideshow.forward(that);
                        Slideshow.run();
                    }
                }

                if (keyControl === true && e.which == Slideshow.key.SHIFT)
                    Slideshow.pause();
            });

            $(document).off("keyup.slideshow."+this.id);
            $(document).on ("keyup.slideshow."+this.id, function(e){

                if(Slideshow.dict[that.id] === undefined) return;
                if(!Slideshow.dict[that.id].isSelected && !Slideshow.dict[that.id].isHover) return;

                if(e.which == Slideshow.key.SHIFT) Slideshow.play();
            });
        });
    }

    Slideshow.updateProgress = function(selector = Slideshow.get("selector"))
    {
        return $(Slideshow.find(selector)).map(function() { 

            if(!$(this).hasClass(Slideshow.state.PLAY)) return;

            //
            // Update timeout value if an active progress bar is found..
            //
            if(Slideshow.dict[this.id].timeout === undefined) {
                
                var timeout = 1000*Slideshow.parseDuration($(Slideshow.dict[this.id].container).data("timeout")) || 0;
                if(!timeout) timeout = 1000*Slideshow.parseDuration(Slideshow.get("timeout")) || 0;

                $(this).find(".slideshow-progress").each(function() {

                    var style = window.getComputedStyle(this, ":before");
                    var progressBarTimeout = 1000*Math.max(Slideshow.parseDuration(style["animation-duration"]),Slideshow.parseDuration(style["transition-duration"]));
                    if(progressBarTimeout != timeout) {
                     
                        if(debug > 1)
                            console.error("Ambiguous timing imposed  \""+timeout+"ms\" compared to current progress bar animation (or transformation) timing \""+progressBarTimeout+"ms\": progress bar animation will be used", style);

                        timeout = progressBarTimeout;
                    }
                });

                if(timeout > 0) {

                    if(debug > 1) console.log("[SLAVE] ","New timing \""+timeout+"ms\" found set for ", this.id);
                    Slideshow.dict[this.id].timeout = timeout;
                }
            }

            //
            // Update relevant progress bar
            //
            var progress = $(
                $(this).find(".slideshow-progress")).not(".slideshow-pager .slideshow-progress")
                .add($(this).find(".slideshow-pager .slideshow-page.active .slideshow-progress")
            );

            //
            // Update progress value
            //
            var nImages = $(this).find(".slideshow-image").length;
            if (nImages > 1) {

                var tick = 1000*Slideshow.parseDuration(Slideshow.get("tick"));
                var timeout = Slideshow.dict[this.id].timeout || 1000*Slideshow.parseDuration(Slideshow.get("timeout"));
                var dP = tick/timeout;

                Slideshow.dict[this.id].progress += dP;
                if (Slideshow.dict[this.id].progress > 1)
                    Slideshow.dict[this.id].progress = 1;
            }

            //
            // Optional: update progress bar progress information
            // (Commented because timeconsuming)
            //
            // var percentage = Slideshow.dict[this.id].progress;
            // $(progress).each(function() {
                
            //     // If progress bar comes from DOMParser().. this.dataset is undefined..
            //     if(this.dataset !== undefined) this.dataset.percentage = percentage;
            //     else $(this).data("percentage", percentage);
            // });
        });
    }

    Slideshow.modulo = function mod(n, m) { return ((n % m) + m) % m; }

    Slideshow.updatePosition = function(selector = Slideshow.get("selector"))
    {
        //
        // Update slideshow position
        //
        return $(Slideshow.find(selector)).map(function() { 

            var entries = $(this).find(".slideshow-entry");
            if (Slideshow.dict[this.id].first === undefined) 
                Slideshow.dict[this.id].first = this.dataset.first || 0;
            if (Slideshow.dict[this.id].last === undefined) 
                Slideshow.dict[this.id].last = entries.length - 1;

            var position = previousPosition = this.dataset.position;
            var firstPosition = Slideshow.dict[this.id].first;
            var lastPosition  = Slideshow.dict[this.id].last;

            if($(this).hasClass(Slideshow.state.REWIND)) 
                position = firstPosition;
            else if($(this).hasClass(Slideshow.state.FASTBACKWARD)) 
                position = (position == firstPosition ? lastPosition : firstPosition);
            else if($(this).hasClass(Slideshow.state.FASTFORWARD)) 
                position = (position == lastPosition ? firstPosition : lastPosition);
            else if($(this).hasClass(Slideshow.state.BACKWARD)) 
                position--;
            else if($(this).hasClass(Slideshow.state.FORWARD)) 
                position++;

            var lastPosition = Slideshow.dict[this.id].last;
            position = Slideshow.modulo(position, lastPosition+1);

            $(this)
                .removeClass(Slideshow.state.FASTBACKWARD)
                .removeClass(Slideshow.state.BACKWARD)
                .removeClass(Slideshow.state.FORWARD)
                .removeClass(Slideshow.state.FASTFORWARD);

            //
            // Update entry 
            //
            var entry = entries[position];
            dispatchEvent(new CustomEvent('slideshow:update', {'slideshow': this, 'entry': entry}));

            $(entry).addClass(Slideshow.state.SHOW);
            $(entries).each(function() {
                return (this != entry ? $(this).removeClass(Slideshow.state.SHOW) : this);
            });

            //
            // Reset progress information
            //
            this.dataset.position = position;
            if(position != previousPosition)
                Slideshow.dict[this.id].progress = 0;
        });
    }

    Slideshow.callback = function(fn = function() {}, delay = 0)
    {
        if(delay == 0) fn();
        else setTimeout(fn, delay);
    }

    Slideshow.activeTiming = function(entry = undefined, timing = undefined)
    {
        var delay    = timing !== undefined ? timing.delay    : 0, 
            duration = timing !== undefined ? timing.duration : 0;

        if(entry !== undefined) {

            var entryStyle = window.getComputedStyle(entry);

            delay    = Math.max(delay, 1000*Math.max(Slideshow.parseDuration(entryStyle["animation-delay"]),    Slideshow.parseDuration(entryStyle["transition-delay"])));
            duration = Math.max(duration, 1000*Math.max(Slideshow.parseDuration(entryStyle["animation-duration"]), Slideshow.parseDuration(entryStyle["transition-duration"])));
            
            var entryStyle = window.getComputedStyle(entry, ":before");
            delay    = Math.max(delay, 1000*Math.max(Slideshow.parseDuration(entryStyle["animation-delay"]),    Slideshow.parseDuration(entryStyle["transition-delay"])));
            duration = Math.max(duration, 1000*Math.max(Slideshow.parseDuration(entryStyle["animation-duration"]), Slideshow.parseDuration(entryStyle["transition-duration"])));
            
            var entryStyle = window.getComputedStyle(entry, ":after");
            delay    = Math.max(delay, 1000*Math.max(Slideshow.parseDuration(entryStyle["animation-delay"]),    Slideshow.parseDuration(entryStyle["transition-delay"])));
            duration = Math.max(duration, 1000*Math.max(Slideshow.parseDuration(entryStyle["animation-duration"]), Slideshow.parseDuration(entryStyle["transition-duration"])));
        }

        return {delay:delay, duration:duration};
    }

    Slideshow.update = function(selector = Slideshow.get("selector"))
    {
        return $(Slideshow.find(selector)).map(function() { 

            //
            // Preload all images..
            //
            var entries = $(this).find(".slideshow-entry");
                entries.each(function(index, entry) {

                    var maxImages = Slideshow.get("max");
                    var nImages = $(this).find(".slideshow-image").length;

                    var alreadyCalled = $(this).find(".slideshow-image").length > 0;
                    if (maxImages > 0 && alreadyCalled && nImages > maxImages) {

                        var image  = this.dataset.image;
                        console.error("Too many slides loaded in slideshow ", slideshow, "\n\"Image " + image + "\".. skip");
                        
                        entry.remove();
                        delete entries[index];
                        return;
                    }

                    if (Slideshow.call(entry, this) === undefined) {
                        entry.remove();
                        delete entries[index];
                        return;
                    }

                    //
                    // Entry number
                    //
                    entry.dataset.num = index;

                    //
                    // Prepare transitions
                    // 
                    if (Slideshow.dict[this.id].transitions === undefined )
                        Slideshow.dict[this.id].transitions = $(this).find(".slideshow-transition");

                    if (Slideshow.dict[this.id].transitions_default === undefined ) {
                        Slideshow.dict[this.id].transitions_default = [];
                        Slideshow.dict[this.id].transitions_default = Slideshow
                            .quadrant(Slideshow.dict[this.id].transitions)
                            .toArray()
                            .map((q, i) => (q !== "") ? q : Slideshow.get("transition"));
                    }

                    // 
                    // Prepare class observer..
                    //
                    Slideshow.dict[this.id].observer = new MutationObserver(function(mutations) {
                        mutations.forEach(function(mutation) {

                            if(Slideshow.dict[this.id] === undefined) return;
                            if(Slideshow.dict[this.id].onHold) return;

                            // Process transitions
                            var transitions = Slideshow.dict[this.id].transitions.toArray();
                            var compass = Slideshow.quadrant(Slideshow.dict[this.id].transitions).toArray();
                                compass.forEach((q, i) =>  $(Slideshow.dict[this.id].transitions[i]).addClass(q === "" ? Slideshow.dict[this.id].transitions_default[i] : ""));

                            // Mark as active
                            var classList = $(mutation.target).prop(mutation.attributeName).split(' ');
                            var isActive = classList.includes(Slideshow.state.ACTIVE);
                            if(!isActive) return;

                            var active = Slideshow.activeTiming(entry);
                            transitions.forEach((t) => active = Slideshow.activeTiming(t, active));

                            dispatchEvent(new CustomEvent('slideshow:active', {'slideshow': this, 'entry': entry}));
                            $(this).addClass(Slideshow.state.ACTIVE);

                            Slideshow.dict[this.id].onHold = true;
                            Slideshow.callback(function() { 

                                //
                                // Update position
                                //
                                Slideshow.updatePosition(this);
                                position = this.dataset.position || 0;

                                //
                                // OPTIONAL: Update pagers
                                //
                                $(this).find(".slideshow-pager").each(function() { 
                                    
                                    $(this).find(".slideshow-page").removeClass(Slideshow.state.ACTIVE);
                                    $(this).find(".slideshow-page").eq(position).addClass(Slideshow.state.ACTIVE);

                                    $(this).find(".slideshow-page.active .slideshow-progress").removeClass(Slideshow.state.PREVENT);
                                    $(this).find(".slideshow-page:not(.active) .slideshow-progress").addClass(Slideshow.state.PREVENT);
                                });

                                // Remove on hold flag
                                $(this).removeClass(Slideshow.state.ACTIVE);
                                
                                var active = Slideshow.activeTiming(entry);
                                if(Slideshow.dict[this.id] === undefined) return;

                                var transitions = Slideshow.dict[this.id].transitions;
                                if (transitions !== undefined) transitions = transitions.toArray();
                                if (transitions !== undefined) transitions.forEach(() => active = Slideshow.activeTiming(this, active));

                                Slideshow.callback(function() {
                                    
                                    Slideshow.dict[this.id].onHold = false;
                                    Slideshow.clearQuadrant(Slideshow.dict[this.id].transitions);
                                    
                                }.bind(this), active.delay + active.duration);

                            }.bind(this), active.delay + active.duration);

                        }.bind(this));

                    }.bind(this));

                    Slideshow.dict[this.id].observer.observe(this, { attributes: true, attributeFilter: ['class']});

                    //
                    // OPTIONAL: Prevent progress bar to start
                    //
                    var progress = $(
                        $(this).find(".slideshow-progress")).not(".slideshow-pager .slideshow-progress")
                        .add($(this).find(".slideshow-pager .slideshow-page.active .slideshow-progress")
                    );

                    var nEntries = $(this).find(".slideshow-entry").length;
                    if (nEntries < 2) $(progress).addClass(Slideshow.state.PREVENT);
                    else $(progress).removeClass(Slideshow.state.PREVENT);

                }.bind(this));

            var position = this.dataset.position || 0;
            var entry = entries[position];
            if (entry === undefined) {

                $(this).addClass(Slideshow.state.EMPTY);
                return this;
            }

            $(entry).addClass(Slideshow.state.SHOW);
            $(this).removeClass(Slideshow.state.EMPTY);

            return this;
        });
    }

    Slideshow.quadrant = function(transitions = []) { return transitions.map(function() { return [this.classList].join(" ").replace("slideshow-transition", "").trim(); }); }
    Slideshow.clearQuadrant = function(transitions = []) { return transitions.map(function() { return $(this).removeClass().addClass("slideshow-transition"); }); }

    Slideshow.find         = function(selector = Slideshow.get("selector")) { return $(selector).filter(function() { return this.id in Slideshow.dict; }); }
    Slideshow.known        = function(selector = Slideshow.get("selector")) { return $(Slideshow.find(selector)).map(function() { return this != undefined; }); }
    Slideshow.length       = function(selector = Slideshow.get("selector")) { return $(Slideshow.find(selector)).map(function() { return $(this).find(".slideshow-entry").length; }); }
    
    Slideshow.play         = function(selector = Slideshow.get("selector"), options = {}) { return $(Slideshow.find(selector)).map(function() { return $(this).removeClass(Slideshow.state.PAUSE).addClass(Slideshow.state.PLAY);  }); }
    Slideshow.goto         = function(selector = Slideshow.get("selector"), position)     { return $(Slideshow.find(selector)).map(function() { $(this).addClass(Slideshow.state.TIMEOUT + Slideshow.state.ACTIVE); return this.dataset.position = position; }); }
    Slideshow.active       = function(selector = Slideshow.get("selector"), position)     { return $(Slideshow.find(selector)).map(function() { return $(this).addClass(Slideshow.state.ACTIVE); }); }
    Slideshow.pause        = function(selector = Slideshow.get("selector")) { return $(Slideshow.find(selector)).map(function() { return $(this).removeClass(Slideshow.state.PLAY).addClass(Slideshow.state.PAUSE); }); }
    Slideshow.rewind       = function(selector = Slideshow.get("selector")) { return $(Slideshow.find(selector)).map(function() { return $(this).addClass(Slideshow.state.REWIND       + " " + Slideshow.state.TIMEOUT + " " + Slideshow.state.ACTIVE); }); }
    Slideshow.fastBackward = function(selector = Slideshow.get("selector")) { return $(Slideshow.find(selector)).map(function() { return $(this).addClass(Slideshow.state.FASTBACKWARD + " " + Slideshow.state.TIMEOUT + " " + Slideshow.state.ACTIVE); }); }
    Slideshow.backward     = function(selector = Slideshow.get("selector")) { return $(Slideshow.find(selector)).map(function() { return $(this).addClass(Slideshow.state.BACKWARD     + " " + Slideshow.state.TIMEOUT + " " + Slideshow.state.ACTIVE); }); }
    Slideshow.forward      = function(selector = Slideshow.get("selector")) { return $(Slideshow.find(selector)).map(function() { return $(this).addClass(Slideshow.state.FORWARD      + " " + Slideshow.state.TIMEOUT + " " + Slideshow.state.ACTIVE); }); }
    Slideshow.fastForward  = function(selector = Slideshow.get("selector")) { return $(Slideshow.find(selector)).map(function() { return $(this).addClass(Slideshow.state.FASTFORWARD  + " " + Slideshow.state.TIMEOUT + " " + Slideshow.state.ACTIVE); }); }
    Slideshow.togglePlay   = function(selector = Slideshow.get("selector")) {
        return $(Slideshow.find(selector)).map(function() { 
            $(this).toggleClass(Slideshow.state.PLAY);
            Slideshow.run();
        }); 
    }

    $(document).ready(function() { Slideshow.onLoad(); });
    $(window).on("focus", function(e){ Slideshow.set("focus", true); });
    $(window).on("blur",  function(e){ Slideshow.set("focus", false); });
    $(window).on("onbeforeunload",  function(e){ Slideshow.clear(); });

    return Slideshow;
});