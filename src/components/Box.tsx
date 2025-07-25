import React, {forwardRef, useContext, type PropsWithChildren} from 'react';
import {type Except} from 'type-fest';
import {type Styles} from '../styles.js';
import {type DOMElement} from '../dom.js';
import {accessibilityContext} from './AccessibilityContext.js';

export type Props = Except<Styles, 'textWrap'> & {
	/**
	 * Screen-reader-specific text to output.
	 * If this is set, all children will be ignored.
	 */
	readonly accessibilityLabel?: string;

	/**
	 * Role of the element.
	 */
	readonly accessibilityRole?:
		| 'button'
		| 'checkbox'
		| 'radio'
		| 'radiogroup'
		| 'list'
		| 'listitem'
		| 'menu'
		| 'menuitem'
		| 'progressbar'
		| 'tab'
		| 'tablist'
		| 'timer'
		| 'toolbar'
		| 'table';

	/**
	 * State of the element.
	 */
	readonly accessibilityState?: {
		readonly checked?: boolean;
		readonly disabled?: boolean;
		readonly expanded?: boolean;
		readonly selected?: boolean;
	};
};

/**
 * `<Box>` is an essential Ink component to build your layout. It's like `<div style="display: flex">` in the browser.
 */
const Box = forwardRef<DOMElement, PropsWithChildren<Props>>(
	(
		{
			children,
			accessibilityLabel,
			accessibilityRole,
			accessibilityState,
			...style
		},
		ref,
	) => {
		const {isScreenReaderEnabled} = useContext(accessibilityContext);
		const label = accessibilityLabel ? (
			<ink-text>{accessibilityLabel}</ink-text>
		) : undefined;

		return (
			<ink-box
				ref={ref}
				style={{
					flexWrap: 'nowrap',
					flexDirection: 'row',
					flexGrow: 0,
					flexShrink: 1,
					...style,
					overflowX: style.overflowX ?? style.overflow ?? 'visible',
					overflowY: style.overflowY ?? style.overflow ?? 'visible',
				}}
				internalAccessiblity={{
					role: accessibilityRole,
					state: accessibilityState,
				}}
			>
				{isScreenReaderEnabled && label ? label : children}
			</ink-box>
		);
	},
);

Box.displayName = 'Box';

export default Box;
