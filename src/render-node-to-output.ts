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

interface ScreenReaderTextFragment {
	x: number;
	y: number;
	value: string;
}

const linearizeFragments = (fragments: ScreenReaderTextFragment[]): string => {
	fragments.sort((a, b) => {
		if (a.y !== b.y) {
			return a.y - b.y;
		}

		return a.x - b.x;
	});

	let output = '';
	let lastY = -1;

	for (const fragment of fragments) {
		if (lastY !== -1) {
			if (fragment.y > lastY) {
				output += '\n'.repeat(fragment.y - lastY);
			} else if (fragment.y === lastY) {
				if (
					output.length > 0 &&
					!output.endsWith(' ')
					&& !output.endsWith('\n')
				) {
					output += ' ';
				}
			}
		}

		output += fragment.value;
		lastY = fragment.y;
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
		isScreenReaderEnabled?: boolean;
	},
	internalState: {
		isInsideStaticElement?: boolean;
		screenReaderFragments?: ScreenReaderTextFragment[];
	} = {},
) => {
	if (options.isScreenReaderEnabled && !internalState.screenReaderFragments) {
		const screenReaderFragments: ScreenReaderTextFragment[] = [];
		renderNodeToOutput(
			node,
			output,
			options,
			{
				...internalState,
				screenReaderFragments,
			},
		);

		const screenReaderOutput = linearizeFragments(screenReaderFragments);
		output.write(0, 0, screenReaderOutput, {transformers: []});
		return;
	}

	const isStatic = internalState.isInsideStaticElement || node.internal_static;

	if (
		(options.skipStaticElements && isStatic) ||
		node.yogaNode?.getDisplay() === Yoga.DISPLAY_NONE
	) {
		return;
	}

	const {transformers = [], isScreenReaderEnabled} = options;

	const override = options.override ?? 0;
	const overrideY = options.overrideY ?? 0;

	const {yogaNode} = node;

	if (yogaNode) {
		// Left and top positions in Yoga are relative to their parent node
		const x = override + yogaNode.getComputedLeft();
		const y = overrideY + yogaNode.getComputedTop();

			if (isScreenReaderEnabled) {
				let text = '';
				if (node.internal_accessibility) {
					const {role, state} = node.internal_accessibility;

					if (role) {
						text += `${role}: `; 
					}

					if (state) {
						const states = Object.entries(state)
							.filter(([, value]) => value)
							.map(([key]) => `(${key})`);

						if (states.length > 0) {
							text += `${states.join(' ')} `; 
						}
					}
				}

				if (node.nodeName === 'ink-text') {
					text += squashTextNodes(node);
				}

				if (text.length > 0) {
					internalState.screenReaderFragments?.push({x, y, value: text});
				}
			}

		// Transformers are functions that transform final text output of each component
		// See Output class for logic that applies transformers
		let newTransformers = transformers;

			if (typeof node.internal_transform === 'function') {
				newTransformers = [node.internal_transform, ...transformers];
			}

			if (node.nodeName === 'ink-text' && !isScreenReaderEnabled) {
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
			}

		let clipped = false;

			if (node.nodeName === 'ink-box' && !isScreenReaderEnabled) {
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
						skipStaticElements: options.skipStaticElements,
						isScreenReaderEnabled,
					},
					{
						...internalState,
						isInsideStaticElement: isStatic,
					});
				}

				if (clipped) {
					output.unclip();
				}
			}
		}
};

export default renderNodeToOutput;
