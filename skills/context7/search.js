#!/usr/bin/env node

const args = process.argv.slice(2);

// Parse options
let numResults = 3;
const nIndex = args.indexOf("-n");
if (nIndex !== -1 && args[nIndex + 1]) {
	numResults = parseInt(args[nIndex + 1], 10);
	args.splice(nIndex, 2);
}

const query = args.join(" ");

if (!query) {
	console.log("Usage: search.js <library-name> [-n <num>]");
	console.log("\nSearch for libraries by name to get their IDs.");
	console.log("\nOptions:");
	console.log("  -n <num>    Number of results (default: 3, max: 20)");
	console.log("\nEnvironment:");
	console.log("  CONTEXT7_API_KEY    Required. Your Context7 API key.");
	console.log("\nExamples:");
	console.log('  search.js "react"');
	console.log('  search.js "nextjs" -n 5');
	console.log('  search.js "typescript"');
	process.exit(1);
}

const apiKey = process.env.CONTEXT7_API_KEY;
if (!apiKey) {
	console.error("Error: CONTEXT7_API_KEY environment variable is required.");
	console.error("Get your API key at: https://context7.com/dashboard");
	process.exit(1);
}

async function searchLibraries(libraryName, numResults) {
	const params = new URLSearchParams({
		libraryName: libraryName,
		query: libraryName, // Use library name as query for relevance
	});

	const url = `https://context7.com/api/v2/libs/search?${params.toString()}`;

	const response = await fetch(url, {
		headers: {
			"Authorization": `Bearer ${apiKey}`,
			"Accept": "application/json",
		}
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`HTTP ${response.status}: ${response.statusText}\n${errorText}`);
	}

	const data = await response.json();
	
	// Return up to numResults - API returns { results: [...] }
	const results = data.results || data;
	return Array.isArray(results) ? results.slice(0, numResults) : [];
}

// Main
try {
	const results = await searchLibraries(query, numResults);

	if (results.length === 0) {
		console.error("No libraries found.");
		process.exit(0);
	}

	for (let i = 0; i < results.length; i++) {
		const lib = results[i];
		console.log(`--- Library ${i + 1} ---`);
		console.log(`ID: ${lib.id || ""}`);
		console.log(`Name: ${lib.title || lib.name || ""}`);
		if (lib.description) {
			console.log(`Description: ${lib.description}`);
		}
		if (lib.totalSnippets) {
			console.log(`Snippets: ${lib.totalSnippets}`);
		}
		if (lib.trustScore) {
			console.log(`Trust Score: ${lib.trustScore}`);
		}
		if (lib.benchmarkScore) {
			console.log(`Benchmark Score: ${lib.benchmarkScore}`);
		}
		if (lib.versions && lib.versions.length > 0) {
			console.log(`Versions: ${lib.versions.join(", ")}`);
		}
		console.log("");
	}
} catch (e) {
	console.error(`Error: ${e.message}`);
	process.exit(1);
}
