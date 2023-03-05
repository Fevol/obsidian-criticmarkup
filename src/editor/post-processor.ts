import { criticmarkupLanguage } from './parser';

const criticMarkup_characters = {
	"Addition": "+",
	"Deletion": "-",
	"Substitution": "~",
	"Highlight": "=",
	"Comment": ">",
}


export function postProcess(el: HTMLElement, ctx: any) {
	const tree = criticmarkupLanguage.parser.parse(el.innerHTML);

	let changes = [];
	let output = el.innerHTML;


	const cursor = tree.cursor();
	while (cursor.next()) {
		const start = cursor.from;
		const end = cursor.to;
		const name = cursor.name;

		if (name === '⚠' || name === 'MSub') continue;

		const is_rendered = output[start+1] !== criticMarkup_characters[name as keyof typeof criticMarkup_characters];

		if (name === 'Substitution') {
			cursor.firstChild();
			if (cursor.name !== 'MSub') continue;

			changes.push({
				start: start,
				end: end,
				name: name,
				middle: cursor.from,
				is_rendered: is_rendered,
			});
		} else {
			changes.push({
				start: start,
				end: end,
				name: name,
				is_rendered: is_rendered,
			});
		}
	}

	changes = changes.reverse();

	for (const change of changes) {
		let new_content = output.substring(change.start, change.end).slice(3, -3);

		let new_element = '';
		if (change.name === "Addition") {
			// new_element = `<ins>${new_content}</ins>`;
		} else if (change.name === "Deletion") {
			// new_element = `<del>${new_content}</del>`;
		} else if (change.name === "Substitution") {
			let middle = <number>change.middle - change.start + 2;
			if (change.is_rendered) {
				new_content = new_content.slice(3, -4)
				middle -= 3;
			}

			const left_part = new_content.slice(0, middle - 5);
			const right_part = new_content.substring(middle);

			new_element = `<span class='criticmarkup-inline criticmarkup-deletion'>${left_part}</span><span class='criticmarkup-inline criticmarkup-addition'>${right_part}</span>`;
		} else if (change.name === "Highlight") {
			if (change.is_rendered) {
				new_content = new_content.slice(4, -5)
			}

			// new_element = `<mark>${new_content}</mark>`;
		} else if (change.name === "Comment") {
			if (change.is_rendered) {
				new_content = new_content.slice(6, -6)
			}
			// new_element = `<span class='criticmarkup-comment'>${new_content}</span>`;
		}

		if (!new_element)
			new_element = `<span class='criticmarkup-inline criticmarkup-${change.name.toLowerCase()}'>${new_content}</span>`;

		output = output.slice(0, change.start) + new_element + output.slice(change.end);
	}
	el.innerHTML = output;
}