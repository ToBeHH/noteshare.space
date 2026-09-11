export function scrollToId(id: string) {
	// getElementById rather than querySelector('#' + id): ids generated from
	// heading text can contain characters that are legal in an id but need
	// escaping in a CSS selector.
	const target = document.getElementById(id);
	if (!target) return;

	target.scrollIntoView();

	// scroll 65px down to avoid the navbar
	window.scrollBy(0, -65);
}
