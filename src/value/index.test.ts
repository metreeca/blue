/*
 * Copyright © 2025-2026 Metreeca srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";


/*
 * Shapes a consumer compiles against come from declaration files, where every return type is spelled out and nothing
 * is evaluated before the consumer first reads it. Resolving the value of a shape in a self-referential graph (a shape
 * referencing an extension of itself) against the generic shape types then walks a cycle the checker cuts short with a
 * provisional verdict, which it keeps: from there on unrelated shapes may pass as resources and their members collapse
 * to `{}`. Dependents saw the collapse in `State`, `Match` and `Frame` leaves, moving between files with the order the
 * checker first met the shapes in.
 *
 * The probes below compile such a consumer as a program of its own, through the compiler API, and assert that it
 * produces no diagnostics. They are runtime tests rather than `*.test-d.ts` type tests, by design:
 *
 * - a type test cannot catch the collapse: the typecheck run compiles every test file in one program, and by the time
 *   it reaches a probe, earlier files have resolved the involved types in a simple context, so the caches already hold
 *   the right verdicts and a type test written against the same graph passed without the fix;
 * - the collapse needs a cold checker: it surfaces only where the probe is the first thing the checker resolves, which
 *   is the situation of a dependent compiling against published declarations, so each probe gets a program of its own
 *   and reads the shapes before they are declared, the order the collapse needs within a single file;
 * - the probe compiles against declaration files: the package declarations are emitted in memory from the sources,
 *   as the build would emit them, and the probe resolves `@metreeca/blue/*` to them, so it reads the shapes exactly as
 *   a dependent does without depending on a prior build;
 * - the fixture stays virtual: the declarations and the probe are served through a compiler host override at paths
 *   under the package, so that `@metreeca/core` and the other dependencies resolve from the package's `node_modules`
 *   while no file is written to `src` or `dist`, where the build and the docs would pick it up.
 *
 * Without the fix, the `State` probe and the lookup contract probe fail with `{}` leaves; the others hold either way
 * and stand as coverage of the sites that relate shapes the same way.
 */

const folder=dirname(fileURLToPath(import.meta.url));

const root=resolve(folder, "../..");

const emitted=resolve(root, ".declared"); // virtual: resolved under the package, never written

const probe=resolve(folder, "index.probe.ts"); // virtual: resolved under the package, never written

const imports=`
	import type { Lazy } from "@metreeca/core";
	import { reference, type ReferenceShape } from "@metreeca/blue/reference";
	import type { Id, PropertyConstraints, ResourceShape } from "@metreeca/blue/resource";
	import type { text } from "@metreeca/blue/string";
	import type { UnionShape } from "@metreeca/blue/union";
	import type { Range, Shape, State, Match, Frame, Items, Draft, Model, Slice } from "@metreeca/blue/value";
`;

/*
 * The graph reaches back into itself through a reference (Organization → Unit → Organization) and carries an embedded
 * resource (Department) beside it. A union branching into the reference is declared on a graph of its own: a union
 * anywhere in the graph changes the order the checker walks it in and the plain graph no longer collapses, so the two
 * are probed apart to keep the plain one biting.
 */

const linked=`
	hasUnit: Multiple<ReferenceShape<typeof Unit>>;
	department: Required<typeof Department>;
`;

const branched=`
	${linked}
	head: Required<UnionShape<[typeof text, ReferenceShape<typeof Unit>]>>;
`;

const options: ts.CompilerOptions={
	strict: true,
	noEmit: true,
	skipLibCheck: true,
	target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.NodeNext,
	moduleResolution: ts.ModuleResolutionKind.NodeNext,
	paths: { "@metreeca/blue/*": [resolve(emitted, "*/index.d.ts")] }
};

const declarations=declare();

/*
 * Emits the package declarations in memory, keyed by the path the build would write them to.
 */
function declare(): ReadonlyMap<string, string> {

	const { config }=ts.readConfigFile(resolve(root, "tsconfig.build.json"), ts.sys.readFile);
	const { fileNames, options: build }=ts.parseJsonConfigFileContent(config, ts.sys, root);

	const program=ts.createProgram(fileNames, {
		...build,
		outDir: emitted,
		noEmit: false,
		emitDeclarationOnly: true,
		declaration: true,
		declarationMap: false,
		sourceMap: false
	});

	const files=new Map<string, string>();

	program.emit(undefined, (file, text) => files.set(file, text)); // the emitter hands files back one by one

	return files;

}

/*
 * Declares the graph with the given members on Organization.
 */
function graph(members: string): string {

	return `
		type Required<S extends Lazy<Shape>> = PropertyConstraints<string> & { readonly kind: "property"; readonly range: Range<S, 1, 1> };
		type Multiple<S extends Lazy<Shape>> = PropertyConstraints<string> & { readonly kind: "property"; readonly range: Range<S, undefined, undefined> };

		declare function Entity(): ResourceShape<[], { id: Id; label: Required<typeof text> }>;
		declare function Department(): ResourceShape<[], { name: Required<typeof text> }>;
		declare function Organization(): ResourceShape<[typeof Entity], { ${members} }>;
		declare function Unit(): ResourceShape<[typeof Organization], { keyword: Required<typeof text> }>;
		declare function University(): ResourceShape<[typeof Organization], {}>;
	`;

}

/*
 * Compiles a probe reading the declared shapes as a program of its own and returns the diagnostics it produces.
 */
function diagnose(body: string, members: string=linked): readonly string[] {

	const source=`${imports}\n${body}\n${graph(members)}`;

	const host=ts.createCompilerHost(options);

	const virtual=(file: string) => file === probe ? source : declarations.get(file);

	const program=ts.createProgram([probe], options, {

		...host,

		fileExists: file => virtual(file) !== undefined || host.fileExists(file),
		directoryExists: directory => directory.startsWith(emitted) || (host.directoryExists?.(directory) ?? false),
		readFile: file => virtual(file) ?? host.readFile(file),

		getSourceFile: (file, language, ...rest) => {

			const text=virtual(file);

			return text === undefined
				? host.getSourceFile(file, language, ...rest)
				: ts.createSourceFile(file, text, language, true);

		}

	});

	return ts.getPreEmitDiagnostics(program).map(diagnostic =>
		ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
	);

}


describe("State", () => {

	test("rejects a member read as the wrong type", () => { // guards the probes against unresolved declarations

		expect(diagnose(`
			export const label: number = (null as unknown as State<typeof University>).label;
		`)).toHaveLength(1);

	});

	test("resolves the members of a shape declared in a self-referential graph", () => {

		expect(diagnose(`
			export const label: string = (null as unknown as State<typeof University>).label;
			export const keyword: string = (null as unknown as State<typeof Unit>).keyword;
			export const units: undefined | readonly string[] = (null as unknown as State<typeof Organization>).hasUnit;
			export const department: { name: string } = (null as unknown as State<typeof Organization>).department;
		`)).toEqual([]);

	});

	test("resolves the branches of a union declared in a self-referential graph", () => {

		expect(diagnose(`
			export const head: string = (null as unknown as State<typeof Organization>).head;
			export const keyword: string = (null as unknown as State<typeof Unit>).keyword;
		`, branched)).toEqual([]);

	});

});

describe("Match", () => {

	test("resolves the members of a shape declared in a self-referential graph", () => {

		expect(diagnose(`
			export const label: string = (null as unknown as Match<typeof University, { label: {} }>).label;
			export const keyword: string = (null as unknown as Match<typeof Unit, { keyword: {} }>).keyword;
			export const units: undefined | readonly { keyword: string }[] =
				(null as unknown as Match<typeof Organization, { hasUnit: { keyword: {} } }>).hasUnit;
			export const department: { name: string } =
				(null as unknown as Match<typeof Organization, { department: { name: {} } }>).department;
		`)).toEqual([]);

	});

	test("resolves the branches of a union declared in a self-referential graph", () => {

		expect(diagnose(`
			export const head: string = (null as unknown as Match<typeof Organization, { head: {} }>).head;
		`, branched)).toEqual([]);

	});

	test("resolves the members looked up through a shape-constrained contract", () => {

		expect(diagnose(`
			declare function lookup<S extends Lazy<ResourceShape>, T extends Model<S, T>>(shape: S, model: T): Match<S, T>;

			export const label: string = lookup(University, { label: {} }).label;
			export const units: undefined | readonly { keyword: string }[] = lookup(Organization, { hasUnit: { keyword: {} } }).hasUnit;
		`)).toEqual([]);

	});

});

describe("Frame", () => {

	test("resolves the items of a collection declared in a self-referential graph", () => {

		expect(diagnose(`
			export const unit: { keyword: string } = (null as unknown as Frame<typeof University, { hasUnit: { keyword: {} } }>);
			export const units: readonly { keyword: string }[] = (null as unknown as Items<typeof University, { hasUnit: { keyword: {} } }>);
		`)).toEqual([]);

	});

});

describe("Draft", () => {

	test("accepts the state of a shape declared in a self-referential graph", () => {

		expect(diagnose(`
			export const draft: Draft<typeof University> = { id: "x", label: "x", department: { name: "x" } };
			export const item: Draft<typeof University, { hasUnit: {} }> = { id: "x", label: "x", department: { name: "x" }, keyword: "y" };
		`)).toEqual([]);

	});

});

describe("Model", () => {

	test("accepts the templates of a shape declared in a self-referential graph", () => {

		expect(diagnose(`
			export const model: Model<typeof University, { label: {}, hasUnit: { keyword: {} }, department: { name: {} } }> =
				{ label: {}, hasUnit: { keyword: {} }, department: { name: {} } };
			export const slice: Slice<typeof University, { hasUnit: { keyword: {} } }> = { hasUnit: { keyword: {} } };
		`)).toEqual([]);

	});

	test("accepts the templates of a union declared in a self-referential graph", () => {

		expect(diagnose(`
			export const model: Model<typeof Organization, { head: {} }> = { head: {} };
			export const branches: Model<typeof Organization, { head: { "1": { keyword: {} } } }> = { head: { "1": { keyword: {} } } };
		`, branched)).toEqual([]);

	});

});

describe("reference", () => {

	test("links a shape declared in a self-referential graph", () => {

		expect(diagnose(`
			export const link: ReferenceShape<typeof Unit> = reference(Unit);
			export const keyword: string = (null as unknown as State<typeof link.target>).keyword;
		`)).toEqual([]);

	});

});
