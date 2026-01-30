#!/usr/bin/env node

const args = process.argv.slice(2);

// Parse format option
let format = "json";
const formatIndex = args.indexOf("--format");
if (formatIndex !== -1 && args[formatIndex + 1]) {
	format = args[formatIndex + 1].toLowerCase();
	args.splice(formatIndex, 2);
}

const libraryId = args[0];
const query = args.slice(1).join(" ");

if (!libraryId || !query) {
	console.log("Usage: docs.js <library-id> <query> [--format <type>]");
	console.log("\nRetrieve documentation for a specific library.");
	console.log("\nArguments:");
	console.log("  library-id    Library ID from search (e.g., /facebook/react)");
	console.log("  query         Your question or task");
	console.log("\nOptions:");
	console.log("  --format <type>    Output format: json (default) or txt");
	console.log("\nEnvironment:");
	console.log("  CONTEXT7_API_KEY    Required. Your Context7 API key.");
	console.log("\nExamples:");
	console.log('  docs.js "/facebook/react" "how to use useState"');
	console.log('  docs.js "/vercel/next.js" "app router setup"');
	console.log('  docs.js "/microsoft/typescript" "generics" --format txt');
	process.exit(1);
}

const apiKey = process.env.CONTEXT7_API_KEY;
if (!apiKey) {
	console.error("Error: CONTEXT7_API_KEY environment variable is required.");
	console.error("Get your API key at: https://context7.com/dashboard");
	process.exit(1);
}

async function getContext(libraryId, query, format) {
	const params = new URLSearchParams({
		libraryId: libraryId,
		query: query,
		type: format,
	});

	const url = `https://context7.com/api/v2/context?${params.toString()}`;

	const response = await fetch(url, {
		headers: {
			"Authorization": `Bearer ${apiKey}`,
			"Accept": "application/json",
		}
	});

	if (response.status === 202) {
		throw new Error("Library is being processed. Please try again later.");
	}

	if (response.status === 301) {
		const data = await response.json();
		throw new Error(`Library has moved. New ID: ${data.redirectUrl || "unknown"}`);
	}

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`HTTP ${response.status}: ${response.statusText}\n${errorText}`);
	}

	if (format === "txt") {
		return await response.text();
	}

	return await response.json();
}

// Main
try {
	const result = await getContext(libraryId, query, format);

	if (format === "txt") {
		// Plain text output
		console.log(result);
	} else {
		// JSON format - API returns { codeSnippets: [...], infoSnippets: [...] }
		const codeSnippets = result.codeSnippets || [];
		const infoSnippets = result.infoSnippets || [];

		if (codeSnippets.length === 0 && infoSnippets.length === 0) {
			console.error("No documentation found.");
			process.exit(0);
		}

		// Print code snippets
		for (let i = 0; i < codeSnippets.length; i++) {
			const doc = codeSnippets[i];
			console.log(`--- Code ${i + 1} ---`);
			if (doc.codeTitle) {
				console.log(`Title: ${doc.codeTitle}`);
			}
			if (doc.codeId) {
				console.log(`Source: ${doc.codeId}`);
			}
			if (doc.codeDescription) {
				console.log(`Description: ${doc.codeDescription}`);
			}
			if (doc.codeList && doc.codeList.length > 0) {
				for (const code of doc.codeList) {
					console.log(`\n\`\`\`${code.language || ""}`);
					console.log(code.code);
					console.log("```");
				}
			}
			console.log("");
		}

		// Print info snippets
		for (let i = 0; i < infoSnippets.length; i++) {
			const doc = infoSnippets[i];
			console.log(`--- Info ${i + 1} ---`);
			if (doc.breadcrumb) {
				console.log(`Topic: ${doc.breadcrumb}`);
			}
			if (doc.pageId) {
				console.log(`Source: ${doc.pageId}`);
			}
			if (doc.content) {
				console.log(`Content:\n${doc.content}`);
			}
			console.log("");
		}
	}
} catch (e) {
	console.error(`Error: ${e.message}`);
	process.exit(1);
}
