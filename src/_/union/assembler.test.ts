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

import { TraceError } from "@metreeca/core/trace";
import { describe, expect, it } from "vitest";
import { boolean } from "../boolean/index.js";
import { number } from "../number/index.js";
import { string } from "../string/index.js";
import { mergeUnion, narrowsUnion } from "./assembler.js";
import { union } from "./index.js";


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
