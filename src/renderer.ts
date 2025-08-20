import renderNodeToOutput from './render-node-to-output.js';
import Output from './output.js';
import {type DOMElement} from './dom.js';

type Result = {
	output: string;
	outputHeight: number;
	staticOutput: string;
};

const renderer = (node: DOMElement, isScreenReaderEnabled: boolean): Result => {
	if (!node.yogaNode) {
		return {
			output: '',
			outputHeight: 0,
			staticOutput: '',
		};
	}

	if (isScreenReaderEnabled) {
		const output = new Output({
			width: node.yogaNode.getComputedWidth(),
			height: node.yogaNode.getComputedHeight()
		});

		renderNodeToOutput(node, output, {
			skipStaticElements: false,
			isScreenReaderEnabled
		});

		if (node.staticNode?.yogaNode) {
			renderNodeToOutput(node.staticNode, output, {
				skipStaticElements: false,
				isScreenReaderEnabled
			});
		}

		const {output: generatedOutput, height: outputHeight} = output.get();

		return {
			output: generatedOutput,
			outputHeight,
			staticOutput: ''
		};
	}

	const output = new Output({
		width: node.yogaNode.getComputedWidth(),
		height: node.yogaNode.getComputedHeight()
	});

	renderNodeToOutput(node, output, {
		skipStaticElements: true,
		isScreenReaderEnabled
	});

	let staticOutput;

	if (node.staticNode?.yogaNode) {
		staticOutput = new Output({
			width: node.staticNode.yogaNode.getComputedWidth(),
			height: node.staticNode.yogaNode.getComputedHeight()
		});

		renderNodeToOutput(node.staticNode, staticOutput, {
			skipStaticElements: false,
			isScreenReaderEnabled
		});
	}

	const {output: generatedOutput, height: outputHeight} = output.get();

	return {
		output: generatedOutput,
		outputHeight,
		// Newline at the end is needed, because static output doesn't have one, so
		// interactive output will override last line of static output
		staticOutput: staticOutput ? `${staticOutput.get().output}\n` : ''
	};
};

export default renderer;
