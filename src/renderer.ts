import renderNodeToOutput from './render-node-to-output.js';
import Output from './output.js';
import {type DOMElement} from './dom.js';

type Result = {
	output: string;
	outputHeight: number;
	staticOutput: string;
};

const renderer = (node: DOMElement, isScreenReaderEnabled: boolean): Result => {
	if (node.yogaNode) {
		// if (isScreenReaderEnabled) {
		// 	const output = renderNodeToScreenReaderOutput(node);
		// 	const outputHeight = output === '' ? 0 : output.split('\n').length;

		// 	let staticOutput = '';
		// 	if (node.staticNode) {
		// 		const staticContent = renderNodeToScreenReaderOutput(node.staticNode);

		// 		if (staticContent) {
		// 			staticOutput = `${staticContent}\n`;
		// 		}
		// 	}

		// 	return {
		// 		output,
		// 		outputHeight,
		// 		staticOutput,
		// 	};
		// }

		const output = new Output({
			width: node.yogaNode.getComputedWidth(),
			height: node.yogaNode.getComputedHeight(),
			isScreenReaderEnabled,
		});

		renderNodeToOutput(node, output, {
			skipStaticElements: true,
			isScreenReaderEnabled,
		});

		let staticOutput;

		if (node.staticNode?.yogaNode) {
			staticOutput = new Output({
				width: node.staticNode.yogaNode.getComputedWidth(),
				height: node.staticNode.yogaNode.getComputedHeight(),
				isScreenReaderEnabled,
			});

			renderNodeToOutput(node.staticNode, staticOutput, {
				skipStaticElements: false,
			});
		}

		const {output: generatedOutput, height: outputHeight} = output.get();

		return {
			output: generatedOutput,
			outputHeight,
			// Newline at the end is needed, because static output doesn't have one, so
			// interactive output will override last line of static output
			staticOutput: staticOutput ? `${staticOutput.get().output}\n` : '',
		};
	}

	return {
		output: '',
		outputHeight: 0,
		staticOutput: '',
	};
};

export default renderer;