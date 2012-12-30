const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Main = imports.ui.main;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Pango = imports.gi.Pango;

const Tweener = imports.ui.tweener;

const MessageTray = imports.ui.messageTray;
const SummaryItem = imports.ui.messageTray.SummaryItem;

const MAX_SOURCE_TITLE_WIDTH = 180;
const ANIMATION_TIME = 0.2;

function init() {
	//let tray = MessageTray.MessageTray.prototype;
	//tray.add = 
}

function enable() {
	SummaryItem.prototype._init = function(source) {
		this.source = source;
		this.source.connect('notification-added', Lang.bind(this, this._notificationAddedToSource));

		this.actor = new St.Button({ style_class: 'summary-source-button',
		                             y_fill: true,
		                             reactive: true,
		                             button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO | St.ButtonMask.THREE,
		                             can_focus: true,
		                             track_hover: true });
		this.actor.label_actor = new St.Label({ text: source.title });
		this.actor.connect('key-press-event', Lang.bind(this, this._onKeyPress));
		this._sourceBox = new St.BoxLayout({ style_class: 'summary-source' });

		this._sourceIcon = source.getSummaryIcon();
		this._sourceTitleBin = new St.Bin({ y_align: St.Align.MIDDLE,
		                                    x_fill: true,
		                                    clip_to_allocation: true });
		this._sourceTitle = new St.Label({ style_class: 'source-title',
		                                   text: source.title });
		this._sourceTitle.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
		this._sourceTitleBin.child = this._sourceTitle;
		this._sourceTitleBin.width = 0;

		this.source.connect('title-changed',
		                    Lang.bind(this, function() {
		                        this._sourceTitle.text = source.title;
		                    }));

		this._sourceBox.add(this._sourceIcon, { y_fill: false });
		this._sourceBox.add(this._sourceTitleBin, { expand: true, y_fill: false });
		this.actor.child = this._sourceBox;

		//this._sourceIcon = source.getSummaryIcon();
		//this._sourceBox.add(this._sourceIcon, { y_fill: false });
		//this.actor.child = this._sourceBox;

		this.notificationStackWidget = new St.Widget({ layout_manager: new Clutter.BinLayout() });

		this.notificationStackView = new St.ScrollView({ style_class: source.isChat ? '' : 'summary-notification-stack-scrollview',
		                                                 vscrollbar_policy: source.isChat ? Gtk.PolicyType.NEVER : Gtk.PolicyType.AUTOMATIC,
		                                                 hscrollbar_policy: Gtk.PolicyType.NEVER });
		this.notificationStackView.add_style_class_name('vfade');
		this.notificationStack = new St.BoxLayout({ style_class: 'summary-notification-stack',
		                                            vertical: true });
		this.notificationStackView.add_actor(this.notificationStack);
		this.notificationStackWidget.add_actor(this.notificationStackView);

		this.closeButton = MessageTray.makeCloseButton();
		this.notificationStackWidget.add_actor(this.closeButton);
		this._stackedNotifications = [];

		this._oldMaxScrollAdjustment = 0;

		this.notificationStackView.vscroll.adjustment.connect('changed', Lang.bind(this, function(adjustment) {
		    let currentValue = adjustment.value + adjustment.page_size;
		    if (currentValue == this._oldMaxScrollAdjustment)
		        this.scrollTo(St.Side.BOTTOM);
		    this._oldMaxScrollAdjustment = adjustment.upper;
		}));

		this.rightClickMenu = source.buildRightClickMenu();
		if (this.rightClickMenu)
		    global.focus_manager.add_group(this.rightClickMenu);
	    };
	    
	// getTitleNaturalWidth, getTitleWidth, and setTitleWidth include
    	// the spacing between the icon and title (which is actually
    	// _sourceTitle's padding-left) as part of the width.
	SummaryItem.prototype.getTitleNaturalWidth = function() {
		let [minWidth, naturalWidth] = this._sourceTitle.get_preferred_width(-1);
		return Math.min(naturalWidth, MAX_SOURCE_TITLE_WIDTH);
	    };

    	SummaryItem.prototype.getTitleWidth = function() {
		return this._sourceTitleBin.width;
	    };

    	SummaryItem.prototype.setTitleWidth = function(width) {
		width = Math.round(width);
		if (width != this._sourceTitleBin.width)
		    this._sourceTitleBin.width = width;
	    };

    	SummaryItem.prototype.setEllipsization = function(mode) {
		this.actor.label_actor.clutter_text.ellipsize = mode;
	    };
	    
	MessageTray.MessageTray.prototype._expandedSummaryItem = null;
	// To simplify the summary item animation code, we pretend
        // that there's an invisible SummaryItem to the left of the
        // leftmost real summary item, and that it's expanded when all
        // of the other items are collapsed.
        MessageTray.MessageTray.prototype._imaginarySummaryItemTitleWidth = 0;
        MessageTray.MessageTray.prototype._summaryItemTitleWidth = 0;

	MessageTray.MessageTray.prototype.add = function(source) {
		if (this.contains(source)) {
		    log('Trying to re-add source ' + source.title);
		    return;
		}

		let summaryItem = new SummaryItem(source);

		if (source.isChat) {
		    this._summary.insert_child_at_index(summaryItem.actor, 0);
		    this._chatSummaryItemsCount++;
		} else {
		    this._summary.insert_child_at_index(summaryItem.actor, this._chatSummaryItemsCount);
		}
		
		///////////////////
		let titleWidth = summaryItem.getTitleNaturalWidth();
		if (titleWidth > this._summaryItemTitleWidth) {
		    this._summaryItemTitleWidth = titleWidth;
		    if (!this._expandedSummaryItem)
		        this._imaginarySummaryItemTitleWidth = titleWidth;
		    this._longestSummaryItem = summaryItem;
		}
		///////////////////

		this._summaryItems.push(summaryItem);

		source.connect('notify', Lang.bind(this, this._onNotify));

		source.connect('muted-changed', Lang.bind(this,
		    function () {
		        if (source.isMuted)
		            this._notificationQueue = this._notificationQueue.filter(function(notification) {
		                return source != notification.source;
		            });
		    }));
		    
		summaryItem.actor.connect('notify::hover', Lang.bind(this,
		    function () {
		        this._onSummaryItemHoverChanged(summaryItem);
		    }));

		summaryItem.actor.connect('clicked', Lang.bind(this,
		    function(actor, button) {
		        actor.grab_key_focus();
		        this._onSummaryItemClicked(summaryItem, button);
		    }));
		summaryItem.actor.connect('popup-menu', Lang.bind(this,
		    function(actor, button) {
		        actor.grab_key_focus();
		        this._onSummaryItemClicked(summaryItem, 3);
		    }));

		source.connect('destroy', Lang.bind(this, this._onSourceDestroy));

		// We need to display the newly-added summary item, but if the
		// caller is about to post a notification, we want to show that
		// *first* and not show the summary item until after it hides.
		// So postpone calling _updateState() a tiny bit.
		Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() { this._updateState(); return false; }));

		this.emit('summary-item-added', summaryItem);
	    };
	    
    MessageTray.MessageTray.prototype._onSummaryItemHoverChanged = function(summaryItem) {
		if (summaryItem.actor.hover)
		    this._setExpandedSummaryItem(summaryItem);
	    };

    MessageTray.MessageTray.prototype._setExpandedSummaryItem= function(summaryItem) {

        if (summaryItem == this._expandedSummaryItem)
            return;

        // We can't just animate individual summary items as the
        // pointer moves in and out of them, because if they don't
        // move in sync you get weird-looking wobbling. So whenever
        // there's a change, we have to re-tween the entire summary
        // area.

        // Turn off ellipsization for the previously expanded item that is
        // collapsing and for the item that is expanding because it looks
        // better that way.
        if (this._expandedSummaryItem) {
            // Ideally, we would remove 'expanded' pseudo class when the item
            // is done collapsing, but we don't track when that happens.
            this._expandedSummaryItem.actor.remove_style_pseudo_class('expanded');
            this._expandedSummaryItem.setEllipsization(Pango.EllipsizeMode.NONE);
        }
        
        this._expandedSummaryItem = summaryItem;
        if (this._expandedSummaryItem) {
            this._expandedSummaryItem.actor.add_style_pseudo_class('expanded');
            this._expandedSummaryItem.setEllipsization(Pango.EllipsizeMode.NONE);
        }

        // We tween on a "_expandedSummaryItemTitleWidth" pseudo-property
        // that represents the current title width of the
        // expanded/expanding item, or the width of the imaginary
        // invisible item if we're collapsing everything.
        Tweener.addTween(this,
                         { _expandedSummaryItemTitleWidth: this._summaryItemTitleWidth,
                           time: ANIMATION_TIME,
                           transition: 'easeOutQuad',
                           onComplete: this._expandSummaryItemCompleted,
                           onCompleteScope: this });
    };

    MessageTray.MessageTray.prototype.__defineGetter__("_expandedSummaryItemTitleWidth", 	function() {
        if (this._expandedSummaryItem)
            return this._expandedSummaryItem.getTitleWidth();
        else
            return this._imaginarySummaryItemTitleWidth;
       }
    );

    MessageTray.MessageTray.prototype.__defineSetter__("_expandedSummaryItemTitleWidth",  	function(expansion) {
        expansion = Math.round(expansion);
        // Expand the expanding item to its new width
        if (this._expandedSummaryItem)
            this._expandedSummaryItem.setTitleWidth(expansion);
        else
            this._imaginarySummaryItemTitleWidth = expansion;

        // Figure out how much space the other items are currently
        // using, and how much they need to be shrunk to keep the
        // total width (including the width of the imaginary item)
        // constant.
        let excess = this._summaryItemTitleWidth - expansion;
        let oldExcess = 0, shrinkage;
        if (excess) {
            for (let i = 0; i < this._summaryItems.length; i++) {
                if (this._summaryItems[i] != this._expandedSummaryItem)
                    oldExcess += this._summaryItems[i].getTitleWidth();
            }
            if (this._expandedSummaryItem)
                oldExcess += this._imaginarySummaryItemTitleWidth;
        }
        if (excess && oldExcess)
            shrinkage = excess / oldExcess;
        else
            shrinkage = 0;

        // Now shrink each one proportionately
        for (let i = 0; i < this._summaryItems.length; i++) {
            if (this._summaryItems[i] == this._expandedSummaryItem)
                continue;

            let oldWidth = this._summaryItems[i].getTitleWidth();
            let newWidth = Math.floor(oldWidth * shrinkage);
            excess -= newWidth;
            this._summaryItems[i].setTitleWidth(newWidth);
        }
        if (this._expandedSummaryItem) {
            let oldWidth = this._imaginarySummaryItemTitleWidth;
            let newWidth = Math.floor(oldWidth * shrinkage);
            excess -= newWidth;
            this._imaginarySummaryItemTitleWidth = newWidth;
        }

        // If the tray as a whole is fully-expanded, make sure the
        // left edge doesn't wobble during animation due to rounding.
        if (this._imaginarySummaryItemTitleWidth == 0 && excess != 0) {
            for (let i = 0; i < this._summaryItems.length; i++) {
                if (this._summaryItems[i] == this._expandedSummaryItem)
                    continue;

                let oldWidth = this._summaryItems[i].getTitleWidth();
                if (oldWidth != 0) {
                    this._summaryItems[i].setTitleWidth (oldWidth + excess);
                    break;
                }
            }
        }
      }
    );

    MessageTray.MessageTray.prototype._expandSummaryItemCompleted = function() {
        if (this._expandedSummaryItem)
            this._expandedSummaryItem.setEllipsization(Pango.EllipsizeMode.END);
    }
    
    MessageTray.MessageTray.prototype._hideSummary = function() {
        this._tween(this._summary, '_summaryState', MessageTray.State.HIDDEN,
                    { opacity: 0,
                      time: ANIMATION_TIME,
                      transition: 'easeOutQuad',
                      onComplete: this._hideSummaryCompleted,
                      onCompleteScope: this
                    });
    };
    
    MessageTray.MessageTray.prototype._hideSummaryCompleted = function() {
        this._setExpandedSummaryItem(null);
    };
}

function disable() {
}
