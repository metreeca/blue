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
import { dictionary } from "../dictionary/index.js";
import { eager } from "./accessors.js";
import { integer } from "../number/index.js";
import { string } from "../string/index.js";
import { union } from "../union/index.js";
import { mergeShape, narrowsShape } from "./assembler.js";


describe("narrowsShape", () => {

	it("routes a pair to the operators of the kind they share", async () => {

		expect(narrowsShape(string({ minLength: 5 }), string())).toBeUndefined();
		expect(narrowsShape(integer({ minInclusive: 0 }), integer())).toBeUndefined();
		expect(narrowsShape(boolean(), boolean())).toBeUndefined();
		expect(narrowsShape(dictionary({ uniqueLang: true }), dictionary())).toBeUndefined();

	});

	it("reports a pair of unshared kinds", async () => {

		expect(narrowsShape(string(), boolean()))
			.toContainEqual(expect.stringContaining("{kind}"));

	});

	it("reports a shape loosening what the inherited one states", async () => {

		expect(narrowsShape(string({ minLength: 1 }), string({ minLength: 5 }))).toBeDefined();

	});

	describe("over a polymorphic inherited shape", () => {

		const inherited = union(string(), integer());

		it("accepts a polymorphic shape dropping an alternative", async () => {

			expect(narrowsShape(union(integer()), inherited)).toBeUndefined();

		});

		it("accepts a plain shape restricting a single alternative", async () => {

			expect(narrowsShape(integer(), inherited)).toBeUndefined();
			expect(narrowsShape(integer({ minInclusive: 0 }), inherited)).toBeUndefined();

		});

		it("reports a plain shape restricting no alternative", async () => {

			expect(narrowsShape(boolean(), inherited))
				.toContainEqual(expect.stringContaining("{branches}"));

		});

		it("reports a plain shape restricting several alternatives", async () => {

			const ambiguous = union(string({ minLength: 1 }), string({ maxLength: 5 }));

			expect(narrowsShape(string({ minLength: 2, maxLength: 4 }), ambiguous))
				.toContainEqual(expect.stringContaining("{branches}"));

		});

		it("reports a polymorphic shape over a plain inherited one", async () => {

			expect(narrowsShape(union(string()), string())).toBeDefined();

		});

	});

});

describe("mergeShape", () => {

	it("routes a pair to the operators of the kind they share", async () => {

		expect(eager(mergeShape(string({ minLength: 5 }), string()))).toMatchObject({
			kind: "string",
			minLength: 5
		});

		expect(eager(mergeShape(integer({ minInclusive: 0 }), integer()))).toMatchObject({
			kind: "number",
			minInclusive: 0
		});

	});

	it("collapses a polymorphic inherited shape to the alternative restricting it", async () => {

		const merged = eager(mergeShape(integer({ minInclusive: 0 }), union(string(), integer())));

		expect(merged).toMatchObject({ kind: "number", minInclusive: 0 });

	});

	it("merges the restricted alternative rather than replacing it", async () => {

		const merged = eager(mergeShape(integer({ minInclusive: 0 }), union(string(), integer({ maxInclusive: 9 }))));

		expect(merged).toMatchObject({ kind: "number", minInclusive: 0, maxInclusive: 9 });

	});

	it("throws where the shape doesn't narrow the inherited one", async () => {

		expect(() => mergeShape(string(), boolean())).toThrow(TraceError);
		expect(() => mergeShape(boolean(), union(string(), integer()))).toThrow(TraceError);

	});

});
