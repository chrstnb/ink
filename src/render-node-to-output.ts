import widestLine from 'widest-line';
import indentString from 'indent-string';
import Yoga from 'yoga-layout';
import wrapText from './wrap-text.js';
import getMaxWidth from './get-max-width.js';
import squashTextNodes from './squash-text-nodes.js';
import renderBorder from './render-border.js';
import renderBackground from './render-background.js';
import {type DOMElement} from './dom.js';
import type Output from './output.js';

// If parent container is `<Box>`, text nodes will be treated as separate nodes in
// the tree and will have their own coordinates in the layout.
// To ensure text nodes are aligned correctly, take X and Y of the first text node
// and use it as offset for the rest of the nodes
// Only first node is taken into account, because other text nodes can't have margin or padding,
// so their coordinates will be relative to the first node anyway
const applyPaddingToText = (node: DOMElement, text: string): string => {
	const yogaNode = node.childNodes[0]?.yogaNode;

	if (yogaNode) {
		const offsetX = yogaNode.getComputedLeft();
		const offsetY = yogaNode.getComputedTop();
		text = '\n'.repeat(offsetY) + indentString(text, offsetX);
	}

	return text;
};

export type OutputTransformer = (s: string, index: number) => string;

const renderNodeToScreenReaderOutput = (
	node: DOMElement,
	options: {skipStaticElements: boolean},
): string => {
	if (
		node.yogaNode?.getDisplay() === Yoga.DISPLAY_NONE ||
		(options.skipStaticElements && node.internal_static)
	) {
		return '';
	}

	let output = '';

	if (node.internal_accessibility) {
		const {role, state} = node.internal_accessibility;

		if (role) {
			output += `${role}: `; 
		}

		if (state) {
			const states = Object.entries(state)
				.filter(([, value]) => value)
				.map(([key]) => `(${key})`);

			if (states.length > 0) {
				output += `${states.join(' ')} `; 
			}
		}
	}

	if (node.nodeName === 'ink-text') {
		const text = squashTextNodes(node);
		return output + text;
	}

	const children = node.childNodes.map(child =>
		renderNodeToScreenReaderOutput(child as DOMElement, options),
	);

	if (node.staticNode) {
		children.push(renderNodeToScreenReaderOutput(node.staticNode, options));
	}

	if (node.nodeName === 'ink-box' || node.nodeName === 'ink-root') {
		const separator =
			node.style.flexDirection === 'column' ||
			node.style.flexDirection === 'column-reverse'
				? '\n'
				: ' ';

		// Filter out empty children to avoid leading/trailing separators
		const nonEmptyChildren = children.filter(child => child.trim().length > 0);
		output += nonEmptyChildren.join(separator);
	} else {
		output += children.join('');
	}

	return output;
};

// After nodes are laid out, render each to output object, which later gets rendered to terminal
const renderNodeToOutput = (
	node: DOMElement,
	output: Output,
	options: {
		override?: number;
		overrideY?: number;
		transformers?: OutputTransformer[];
		skipStaticElements: boolean;
		isScreenReaderEnabled: boolean;
	},
) => {
	const {
		override = 0,
		overrideY = 0,
		transformers = [],
		skipStaticElements,
		isScreenReaderEnabled,
	} = options;

	if (isScreenReaderEnabled) {
		const screenReaderOutput = renderNodeToScreenReaderOutput(node, {
			skipStaticElements,
		});

		output.write(0, 0, screenReaderOutput, {transformers: []});
		return;
	}


	if (skipStaticElements && node.internal_static) {
		return;
	}

	const {yogaNode} = node;

	if (yogaNode) {
		if (yogaNode.getDisplay() === Yoga.DISPLAY_NONE) {
			return;
		}

		// Left and top positions in Yoga are relative to their parent node
		const x = override + yogaNode.getComputedLeft();
		const y = overrideY + yogaNode.getComputedTop();

		// Transformers are functions that transform final text output of each component
		// See Output class for logic that applies transformers
		let newTransformers = transformers;

		if (typeof node.internal_transform === 'function') {
			newTransformers = [node.internal_transform, ...transformers];
		}

		if (node.nodeName === 'ink-text') {
			let text = squashTextNodes(node);

			if (text.length > 0) {
				const currentWidth = widestLine(text);
				const maxWidth = getMaxWidth(yogaNode);

				if (currentWidth > maxWidth) {
					const textWrap = node.style.textWrap ?? 'wrap';
					text = wrapText(text, maxWidth, textWrap);
				}

				text = applyPaddingToText(node, text);

				output.write(x, y, text, {transformers: newTransformers});
			}

			return;
		}

		let clipped = false;

		if (node.nodeName === 'ink-box') {
			renderBackground(x, y, node, output);
			renderBorder(x, y, node, output);

			const clipHorizontally =
				node.style.overflowX === 'hidden' || node.style.overflow === 'hidden';
			const clipVertically =
				node.style.overflowY === 'hidden' || node.style.overflow === 'hidden';

			if (clipHorizontally || clipVertically) {
				const x1 = clipHorizontally
					? x + yogaNode.getComputedBorder(Yoga.EDGE_LEFT)
					: undefined;

				const x2 = clipHorizontally
					? x +
					  yogaNode.getComputedWidth() -
					  yogaNode.getComputedBorder(Yoga.EDGE_RIGHT)
					: undefined;

				const y1 = clipVertically
					? y + yogaNode.getComputedBorder(Yoga.EDGE_TOP)
					: undefined;

				const y2 = clipVertically
					? y +
					  yogaNode.getComputedHeight() -
					  yogaNode.getComputedBorder(Yoga.EDGE_BOTTOM)
					: undefined;

				output.clip({x1, x2, y1, y2});
				clipped = true;
			}
		}

		if (node.nodeName === 'ink-root' || node.nodeName === 'ink-box') {
			for (const childNode of node.childNodes) {
				renderNodeToOutput(childNode as DOMElement, output, {
					override: x,
					overrideY: y,
					transformers: newTransformers,
					skipStaticElements,
					isScreenReaderEnabled,
				});
			}

			if (clipped) {
				output.unclip();
			}
		}
	}
};

export default renderNodeToOutput;
