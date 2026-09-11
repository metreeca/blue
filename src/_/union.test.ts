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

import { immutable } from "@metreeca/core/structures";
import { TraceError } from "@metreeca/core/trace";
import { describe, expect, it } from "vitest";
import { boolean } from "./boolean.js";
import { number } from "./number.js";
import { reference } from "./reference.js";
import type { Parents, ResourceConstraints, ResourceShape } from "./resource.js";
import { string } from "./string.js";
import {
	getBoundBranch,
	getModelBranches,
	getShapeBranches,
	getStateBranch,
	mergeUnion,
	narrowsUnion,
	validateUnion
} from "./union.core.js";
import { union } from "./union.js";


// build a resource shape without the resource() factory, keeping the suite to the union module alone

function target(constraints: ResourceConstraints = {}, ...parents: Parents): ResourceShape {
	return immutable({ kind: "resource", classes: [], parents, members: {}, ...constraints });
}


describe("factories", () => {

	describe("union", () => {

		it("returns a shape with kind 'union'", async () => {

			expect(union(string(), number()).kind).toBe("union");

		});

		it("retains the branches in the order they were stated", async () => {

			const text = string();
			const count = number();

			expect(union(text, count).branches).toEqual([text, count]);

		});

		it("keeps a deferred branch deferred", async () => {

			const text = string();
			const deferred = () => text;

			expect(union(deferred).branches).toEqual([deferred]);

		});

		it("accepts a single branch", async () => {

			expect(union(string()).branches).toHaveLength(1);

		});

		it("flattens a nested union into its own branches", async () => {

			const text = string();
			const count = number();
			const flag = boolean();

			expect(union(text, union(count, flag)).branches).toEqual([text, count, flag]);

		});

		it("flattens a nested union at any depth", async () => {

			const text = string();
			const count = number();
			const flag = boolean();

			expect(union(union(text, union(count)), flag).branches).toEqual([text, count, flag]);

		});

		it("leaves a deferred nested union deferred", async () => {

			const nested = () => union(number(), boolean());
			const text = string();

			expect(union(text, nested).branches).toEqual([text, nested]);

		});

		it("returns an immutable shape", async () => {

			const shape = union(string(), number());

			expect(() => Object.assign(shape, { kind: "string" })).toThrow();

		});

		it("includes only the kind and branches entries", async () => {

			expect(Object.keys(union(string())).sort()).toEqual(["branches", "kind"]);

		});

	});

});

describe("operators", () => {

	describe("narrowsUnion", () => {

		it("accepts an identical child", async () => {

			expect(narrowsUnion(union(string(), number()), union(string(), number()))).toBeUndefined();

		});

		it("accepts a child tightening a branch", async () => {

			expect(narrowsUnion(
				union(string({ minLength: 1 }), number()),
				union(string(), number())
			)).toBeUndefined();

		});

		it("accepts a child dropping a branch", async () => {

			expect(narrowsUnion(union(number()), union(string(), number()))).toBeUndefined();

		});

		it("pairs branches regardless of the order they are stated in", async () => {

			expect(narrowsUnion(union(number(), string()), union(string(), number()))).toBeUndefined();

		});

		it("rejects a child adding a branch", async () => {

			expect(narrowsUnion(
				union(string(), number(), boolean()),
				union(string(), number())
			)).toBeDefined();

		});

		it("rejects a child branch narrowing no inherited branch", async () => {

			expect(narrowsUnion(union(boolean()), union(string(), number()))).toBeDefined();

		});

		it("rejects two child branches claiming the same inherited branch", async () => {

			expect(narrowsUnion(
				union(string({ minLength: 1 }), string({ minLength: 2 })),
				union(string(), number())
			)).toBeDefined();

		});

		it("rejects a child branch widening the one it claims", async () => {

			expect(narrowsUnion(
				union(string({ minLength: 1 })),
				union(string({ minLength: 5 }))
			)).toBeDefined();

		});

		it("accepts a child branch leaving an inherited bound unstated", async () => {

			// silence inherits the bound rather than widening it

			expect(narrowsUnion(
				union(string()),
				union(string({ minLength: 1 }))
			)).toBeUndefined();

		});

	});

	describe("mergeUnion", () => {

		it("preserves kind as 'union'", async () => {

			expect(mergeUnion(union(string()), union(string())).kind).toBe("union");

		});

		it("keeps the branches the child claims", async () => {

			const merged = mergeUnion(union(number()), union(string(), number()));

			expect(merged.branches).toHaveLength(1);
			expect(merged.branches[0]).toMatchObject({ kind: "number" });

		});

		it("merges a claimed branch with the one claiming it", async () => {

			const merged = mergeUnion(
				union(string({ minLength: 2 })),
				union(string({ maxLength: 5 }))
			);

			expect(merged.branches[0]).toMatchObject({ kind: "string", minLength: 2, maxLength: 5 });

		});

		it("keeps the inherited branch order", async () => {

			const merged = mergeUnion(
				union(number(), string()),
				union(string(), number())
			);

			expect(merged.branches.map(branch => (branch as { kind: string }).kind)).toEqual(["string", "number"]);

		});

		it("returns an immutable shape", async () => {

			const merged = mergeUnion(union(string()), union(string()));

			expect(() => Object.assign(merged, { kind: "string" })).toThrow();

		});

		it("rejects a child adding a branch", async () => {

			expect(() => mergeUnion(
				union(string(), boolean()),
				union(string())
			)).toThrow(TraceError);

		});

	});

	describe("getShapeBranches", () => {

		it("flattens a union to its branches", async () => {

			const text = string();
			const count = number();

			expect(getShapeBranches(union(text, count))).toEqual([text, count]);

		});

		it("takes a plain shape to the single branch it is", async () => {

			const text = string();

			expect(getShapeBranches(text)).toEqual([text]);

		});

		it("resolves a deferred range", async () => {

			const text = string();

			expect(getShapeBranches(() => text)).toEqual([text]);

		});

		it("resolves a deferred branch", async () => {

			const text = string();

			expect(getShapeBranches(union(() => text))).toEqual([text]);

		});

		it("flattens a nested union into the enclosing one", async () => {

			const text = string();
			const count = number();
			const flag = boolean();

			expect(getShapeBranches(union(text, union(count, flag)))).toEqual([text, count, flag]);

		});

	});

});

describe("validators", () => {

	describe("validateUnion", () => {

		const shape = union(string(), number());

		it("returns undefined for empty values", async () => {

			expect(validateUnion([], shape)).toBeUndefined();

		});

		it("accepts a value belonging to one branch", async () => {

			expect(validateUnion(["hello"], shape)).toBeUndefined();
			expect(validateUnion([42], shape)).toBeUndefined();

		});

		it("keys a violation by element for a value belonging to no branch", async () => {

			expect(validateUnion([true], shape)).toEqual([{ "0": [expect.stringContaining("no")] }]);

		});

		it("reports only the values belonging to no branch", async () => {

			const trace = validateUnion(["hello", true, 42], shape);

			expect(trace).toEqual([{ "1": [expect.stringContaining("no")] }]);

		});

		it("rejects a value belonging to several branches as ambiguous", async () => {

			const overlapping = union(string({ minLength: 1 }), string({ maxLength: 9 }));

			expect(validateUnion(["hello"], overlapping))
				.toEqual([{ "0": [expect.stringContaining("several")] }]);

		});

		it("admits a placeholder fitting several branches", async () => {

			const overlapping = union(string({ minLength: 1 }), string({ maxLength: 9 }));

			expect(validateUnion(["hello"], overlapping, { scope: "model" })).toBeUndefined();

		});

		it("still rejects a placeholder fitting no branch", async () => {

			expect(validateUnion([true], shape, { scope: "model" }))
				.toEqual([{ "0": [expect.stringContaining("no")] }]);

		});

		it("requires a bound to single out one branch", async () => {

			expect(validateUnion([42], shape, { scope: "bound" })).toBeUndefined();
			expect(validateUnion([true], shape, { scope: "bound" }))
				.toEqual([{ "0": [expect.stringContaining("no")] }]);

		});

		it("admits a bound outside the value domain of the branch it singles out", async () => {

			const bounded = union(number({ minInclusive: 1, maxInclusive: 5 }), string());

			expect(validateUnion([8], bounded, { scope: "bound" })).toBeUndefined();

		});

	});

	describe("getStateBranch", () => {

		const branches = [string(), number()];

		it("picks the branch a value belongs to", async () => {

			expect(getStateBranch("hello", branches)).toBe(branches[0]);
			expect(getStateBranch(42, branches)).toBe(branches[1]);

		});

		it("picks nothing for a value belonging to no branch", async () => {

			expect(getStateBranch(true, branches)).toBeUndefined();

		});

		it("picks nothing for a value belonging to several branches", async () => {

			expect(getStateBranch("hello", [string({ minLength: 1 }), string({ maxLength: 9 })])).toBeUndefined();

		});

		it("holds a value to every constraint of the branch", async () => {

			expect(getStateBranch(8, [number({ minInclusive: 1, maxInclusive: 5 })])).toBeUndefined();

		});

	});

	describe("getBoundBranch", () => {

		it("picks the branch a bound filters against", async () => {

			const branches = [number(), string()];

			expect(getBoundBranch(42, branches)).toBe(branches[0]);

		});

		it("picks a branch for a bound outside its value domain", async () => {

			const branches = [number({ minInclusive: 1, maxInclusive: 5 })];

			expect(getBoundBranch(8, branches)).toBe(branches[0]);

		});

		it("picks nothing for a bound filtering no branch", async () => {

			expect(getBoundBranch(true, [number(), string()])).toBeUndefined();

		});

		it("picks nothing for a bound filtering several branches", async () => {

			expect(getBoundBranch("hello", [string(), string()])).toBeUndefined();

		});

	});

	describe("getModelBranches", () => {

		it("picks every branch a placeholder fits", async () => {

			const branches = [string({ minLength: 1 }), string({ maxLength: 9 })];

			expect(getModelBranches("", branches)).toEqual(branches);

		});

		it("picks the single branch a placeholder of that type fits", async () => {

			const branches = [string(), number()];

			expect(getModelBranches(42, branches)).toEqual([branches[1]]);

		});

		it("picks nothing for a placeholder fitting no branch", async () => {

			expect(getModelBranches(true, [string(), number()])).toBeUndefined();

		});

		it("fits a reference branch by its identifier", async () => {

			const branches = [reference(target()), string()];

			expect(getModelBranches("app:/vendors/1", branches)).toEqual(branches);

		});

	});

});
