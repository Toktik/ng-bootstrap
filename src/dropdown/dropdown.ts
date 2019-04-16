import {
  forwardRef,
  Inject,
  Directive,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ContentChild,
  NgZone,
  Renderer2,
  OnInit, SimpleChanges, OnChanges
} from '@angular/core';
import {NgbDropdownConfig} from './dropdown-config';
import {positionElements, PlacementArray, Placement} from '../util/positioning';
import { DOCUMENT } from '@angular/common';

/**
 */
@Directive({
  selector: '[ngbDropdownMenu]',
  host: {'[class.dropdown-menu]': 'true', '[class.show]': 'dropdown.isOpen()', '[attr.x-placement]': 'placement'}
})
export class NgbDropdownMenu {
  placement: Placement = 'bottom';
  isOpen = false;

  constructor(
      @Inject(forwardRef(() => NgbDropdown)) public dropdown, private _elementRef: ElementRef<HTMLElement>,
      private _renderer: Renderer2) {}

  isEventFrom($event) { return this._elementRef.nativeElement.contains($event.target); }

  position(triggerEl, placement) {
    this.applyPlacement(positionElements(triggerEl, this._elementRef.nativeElement, placement));
  }

  applyPlacement(_placement: Placement) {
    // remove the current placement classes
    this._renderer.removeClass(this._elementRef.nativeElement.parentNode, 'dropup');
    this._renderer.removeClass(this._elementRef.nativeElement.parentNode, 'dropdown');
    this.placement = _placement;
    /**
     * apply the new placement
     * in case of top use up-arrow or down-arrow otherwise
     */
    if (_placement.search('^top') !== -1) {
      this._renderer.addClass(this._elementRef.nativeElement.parentNode, 'dropup');
    } else {
      this._renderer.addClass(this._elementRef.nativeElement.parentNode, 'dropdown');
    }
  }
}

/**
 * Marks an element to which dropdown menu will be anchored. This is a simple version
 * of the NgbDropdownToggle directive. It plays the same role as NgbDropdownToggle but
 * doesn't listen to click events to toggle dropdown menu thus enabling support for
 * events other than click.
 *
 * @since 1.1.0
 */
@Directive({
  selector: '[ngbDropdownAnchor]',
  host: {'class': 'dropdown-toggle', 'aria-haspopup': 'true', '[attr.aria-expanded]': 'dropdown.isOpen()'}
})
export class NgbDropdownAnchor {
  anchorEl;

  constructor(@Inject(forwardRef(() => NgbDropdown)) public dropdown, private _elementRef: ElementRef<HTMLElement>) {
    this.anchorEl = _elementRef.nativeElement;
  }

  isEventFrom($event) { return this._elementRef.nativeElement.contains($event.target); }
}

/**
 * Allows the dropdown to be toggled via click. This directive is optional: you can use NgbDropdownAnchor as an
 * alternative.
 */
@Directive({
  selector: '[ngbDropdownToggle]',
  host: {
    'class': 'dropdown-toggle',
    'aria-haspopup': 'true',
    '[attr.aria-expanded]': 'dropdown.isOpen()',
    '(click)': 'toggleOpen()'
  },
  providers: [{provide: NgbDropdownAnchor, useExisting: forwardRef(() => NgbDropdownToggle)}]
})
export class NgbDropdownToggle extends NgbDropdownAnchor {
  constructor(@Inject(forwardRef(() => NgbDropdown)) dropdown, elementRef: ElementRef<HTMLElement>) {
    super(dropdown, elementRef);
  }

  toggleOpen() { this.dropdown.toggle(); }
}

/**
 * Transforms a node into a dropdown.
 */
@Directive({
  selector: '[ngbDropdown]',
  exportAs: 'ngbDropdown',
  host: {'[class.show]': 'isOpen()', '(keyup.esc)': 'closeFromOutsideEsc()'}
})
export class NgbDropdown implements OnChanges, OnInit {
  private _zoneSubscription: any;
  /**
   * Holds the remove listener method returned by listenGlobal
   */
  private _outsideClickListener;
  private _bodyContainer: HTMLElement;

  @ContentChild(NgbDropdownMenu) private _menu: NgbDropdownMenu;
  @ContentChild(NgbDropdownMenu, {read: ElementRef}) private _menuElement: ElementRef;

  @ContentChild(NgbDropdownAnchor) private _anchor: NgbDropdownAnchor;

  /**
   * Indicates that dropdown should be closed when selecting one of dropdown items (click) or pressing ESC.
   * When it is true (default) dropdowns are automatically closed on both outside and inside (menu) clicks.
   * When it is false dropdowns are never automatically closed.
   * When it is 'outside' dropdowns are automatically closed on outside clicks but not on menu clicks.
   * When it is 'inside' dropdowns are automatically on menu clicks but not on outside clicks.
   */
  @Input() autoClose: boolean | 'outside' | 'inside';

  /**
   *  Defines whether or not the dropdown-menu is open initially.
   */
  @Input('open') _open = false;

  /**
   * Placement of a popover accepts:
   *    "top", "top-left", "top-right", "bottom", "bottom-left", "bottom-right",
   *    "left", "left-top", "left-bottom", "right", "right-top", "right-bottom"
   * and array of above values.
   */
  @Input() placement: PlacementArray;


  /**
   * A selector specifying the element the dropdown should be appended to.
   * Currently only supports "body".
   */
  @Input() container: null | 'body';

  /**
   *  An event fired when the dropdown is opened or closed.
   *  Event's payload equals whether dropdown is open.
   */
  @Output() openChange = new EventEmitter();

  constructor(
    config: NgbDropdownConfig,
    ngZone: NgZone,
    @Inject(DOCUMENT) private _document: any,
    private _elementRef: ElementRef<HTMLElement>,
    private _renderer: Renderer2
  ) {
    this.placement = config.placement;
    this.container = config.container;
    this.autoClose = config.autoClose;
    this._zoneSubscription = ngZone.onStable.subscribe(() => { this._positionMenu(); });
  }

  ngOnInit() {
    this._applyPlacementClasses();
    if (this._open) {
      this._registerListener();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.container && this._open) {
      this._applyContainer(this.container);
    }

    if (changes.placement && !changes.placement.isFirstChange) {
      this._applyPlacementClasses();
    }
  }

  /**
   * Checks if the dropdown menu is open or not.
   */
  isOpen(): boolean { return this._open; }

  /**
   * Opens the dropdown menu of a given navbar or tabbed navigation.
   */
  open(): void {
    if (!this._open) {
      this._open = true;
      this._applyContainer(this.container);
      this._registerListener();
      this._positionMenu();
      this.openChange.emit(true);
    }
  }

  /**
   * Closes the dropdown menu of a given navbar or tabbed navigation.
   */
  close(): void {
    if (this._open) {
      this._open = false;
      this._resetContainer();

      // Removes "listenGlobal" listener
      this._outsideClickListener();

      this.openChange.emit(false);
    }
  }

  /**
   * Toggles the dropdown menu of a given navbar or tabbed navigation.
   */
  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  closeFromClick($event) {
    if (this.autoClose && $event.button !== 2 && !this._isEventFromToggle($event)) {
      if (this.autoClose === true) {
        this.close();
      } else if (this.autoClose === 'inside' && this._isEventFromMenu($event)) {
        this.close();
      } else if (this.autoClose === 'outside' && !this._isEventFromMenu($event)) {
        this.close();
      }
    }
  }

  closeFromOutsideEsc() {
    if (this.autoClose) {
      this.close();
    }
  }

  ngOnDestroy() {
    this._resetContainer();
    this._zoneSubscription.unsubscribe();
  }

  private _isEventFromToggle($event) { return this._anchor.isEventFrom($event); }

  private _isEventFromMenu($event) { return this._menu ? this._menu.isEventFrom($event) : false; }

  private _registerListener() {
    this._outsideClickListener = this._renderer.listen('document', 'click', (e) => this.closeFromClick(e));
  }

  private _positionMenu() {
    if (this.isOpen() && this._menu) {
      this._applyPlacementClasses(
        positionElements(
          this._anchor.anchorEl, this._bodyContainer || this._menuElement.nativeElement, this.placement,
          this.container === 'body'));
    }
  }

  private _resetContainer() {
    const renderer = this._renderer;
    if (this._menuElement) {
      const dropdownElement = this._elementRef.nativeElement;
      const dropdownMenuElement = this._menuElement.nativeElement;

      renderer.appendChild(dropdownElement, dropdownMenuElement);
      renderer.removeStyle(dropdownMenuElement, 'position');
      renderer.removeStyle(dropdownMenuElement, 'transform');
    }
    if (this._bodyContainer) {
      renderer.removeChild(this._document.body, this._bodyContainer);
      this._bodyContainer = null;
    }
  }

  private _applyContainer(container: null | 'body' = null) {
    this._resetContainer();
    if (container === 'body') {
      const renderer = this._renderer;
      const dropdownMenuElement = this._menuElement.nativeElement;
      const bodyContainer = this._bodyContainer = this._bodyContainer || renderer.createElement('div');

      // Override some styles to have the positionning working
      renderer.setStyle(bodyContainer, 'position', 'absolute');
      renderer.setStyle(dropdownMenuElement, 'position', 'static');

      renderer.appendChild(bodyContainer, dropdownMenuElement);
      renderer.appendChild(this._document.body, bodyContainer);
    }
  }

  private _applyPlacementClasses(placement?: Placement) {
    if (this._menu) {
      if (!placement) {
        placement = Array.isArray(this.placement) ? this.placement[0] : this.placement as Placement;
      }

      const renderer = this._renderer;
      const dropdownElement = this._elementRef.nativeElement;

      // remove the current placement classes
      renderer.removeClass(dropdownElement, 'dropup');
      renderer.removeClass(dropdownElement, 'dropdown');
      this.placement = placement;
      this._menu.placement = placement;

      /*
     * apply the new placement
     * in case of top use up-arrow or down-arrow otherwise
     */
      const dropdownClass = placement.search('^top') !== -1 ? 'dropup' : 'dropdown';
      renderer.addClass(dropdownElement, dropdownClass);

      const bodyContainer = this._bodyContainer;
      if (bodyContainer) {
        renderer.removeClass(bodyContainer, 'dropup');
        renderer.removeClass(bodyContainer, 'dropdown');
        renderer.addClass(bodyContainer, dropdownClass);
      }
    }
  }
}
