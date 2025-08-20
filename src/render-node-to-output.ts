import widestLine from 'widest-line';
import indentString from 'indent-string';
import Yoga from 'yoga-layout';
import wrapText from './wrap-text.js';
import getMaxWidth from './get-max-width.js';
import squashTextNodes from './squash-text-nodes.js';
import renderBorder from './render-border.js';
import renderBackground from './render-background.js';
import {type DOMElement} from './dom.js';
import Output from './output.js';

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

// After nodes are laid out, render each to output object, which later gets rendered to terminal
const renderNodeToOutput = (
	node: DOMElement,
	output: Output,
	options: {
		offsetX?: number;
		offsetY?: number;
		transformers?: OutputTransformer[];
		skipStaticElements: boolean;
		isScreenReaderEnabled?: boolean;
	},
) => {
	const {
		offsetX = 0,
		offsetY = 0,
		transformers = [],
		skipStaticElements,
		isScreenReaderEnabled = false,
	} = options;

	if (skipStaticElements && node.internal_static) {
		return;
	}

	const {yogaNode} = node;
	if (!yogaNode || yogaNode.getDisplay() === Yoga.DISPLAY_NONE) {
		return;
	}

	// In screen reader mode, accessibility info is rendered before the node's content.
	if (isScreenReaderEnabled && node.internal_accessibility) {
		let accessibilityText = '';
		const {role, state} = node.internal_accessibility;

		if (state) {
			const stateKeys = Object.keys(state) as Array<keyof typeof state>;
			const stateDescription = stateKeys
				.filter(key => state[key])
				.join(', ');

			if (stateDescription) {
				accessibilityText += `(${stateDescription}) `;
			}
		}

		if (role) {
			accessibilityText += `${role}: `;
		}

		if (accessibilityText) {
			output.write(0, 0, accessibilityText, {transformers: []});
		}
	}

	// Handle text nodes
	if (node.nodeName === 'ink-text') {
		let text = squashTextNodes(node);

		if (text.length > 0) {
			if (isScreenReaderEnabled) {
				output.write(0, 0, text, {transformers: []});
			} else {
				const x = offsetX + yogaNode.getComputedLeft();
				const y = offsetY + yogaNode.getComputedTop();

				let newTransformers = transformers;
				if (typeof node.internal_transform === 'function') {
					newTransformers = [node.internal_transform, ...transformers];
				}

				const currentWidth = widestLine(text);
				const maxWidth = getMaxWidth(yogaNode);

				if (currentWidth > maxWidth) {
					const textWrap = node.style.textWrap ?? 'wrap';
					text = wrapText(text, maxWidth, textWrap);
				}

				text = applyPaddingToText(node, text);
				output.write(x, y, text, {transformers: newTransformers});
			}
		}
		return;
	}

	// Handle container nodes
	if (node.nodeName === 'ink-root' || node.nodeName === 'ink-box') {
		// Visual-only rendering for background, borders, and clipping
		let clipped = false;
		if (!isScreenReaderEnabled) {
			const x = offsetX + yogaNode.getComputedLeft();
			const y = offsetY + yogaNode.getComputedTop();
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

		// Render children
		if (isScreenReaderEnabled) {
			const separator =
				node.style.flexDirection === 'row' ||
				node.style.flexDirection === 'row-reverse'
					? ' '
					: '\n';

			const childNodes =
				node.style.flexDirection === 'row-reverse' ||
				node.style.flexDirection === 'column-reverse'
					? [...node.childNodes].reverse()
					: [...node.childNodes];

			const childOutputs = childNodes.map(childNode => {
				const tempOutput = new Output({
					width: 0,
					height: 0,
					isScreenReaderEnabled: true,
				});
				renderNodeToOutput(childNode as DOMElement, tempOutput, {
					...options,
					isScreenReaderEnabled: true,
				});
				return tempOutput.get().output;
			});

			const text = childOutputs.filter(Boolean).join(separator);
			if (text) {
				output.write(0, 0, text, {transformers: []});
			}
		} else {
			const x = offsetX + yogaNode.getComputedLeft();
			const y = offsetY + yogaNode.getComputedTop();
			let newTransformers = transformers;
			if (typeof node.internal_transform === 'function') {
				newTransformers = [node.internal_transform, ...transformers];
			}

			for (const childNode of node.childNodes) {
				renderNodeToOutput(childNode as DOMElement, output, {
					offsetX: x,
					offsetY: y,
					transformers: newTransformers,
					skipStaticElements,
					isScreenReaderEnabled: false,
				});
			}
		}

		// Visual-only cleanup
		if (!isScreenReaderEnabled && clipped) {
			output.unclip();
		}
	}
};

export default renderNodeToOutput;