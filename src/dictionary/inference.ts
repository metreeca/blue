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


/**
 * Dictionary value inference.
 *
 * Types every form a localised value takes from the dictionary shape that describes it: the tag-keyed map the value
 * is stored and submitted as, and the negotiated text a retrieval returns in its place. Both forms follow the per-tag
 * arity the shape admits, so stored and retrieved text never disagree on how many strings a tag carries.
 *
 * @module
 */

import type { Eager, Lazy } from "@metreeca/core";
import type { Tag } from "@metreeca/core/language";
import type { DictionaryConstraints, DictionaryShape } from "./index.js";

/**
 * Resolves the tag-keyed map a dictionary shape describes.
 *
 * Yields a map keyed by language tag, carrying a single string under each tag where the shape states
 * {@link DictionaryConstraints.uniqueLang | uniqueLang} and an array of strings under each tag otherwise, so that the
 * content of a tag is typed at the arity the shape admits. A shape leaving the constraint unstated, or stating it only
 * as a boolean, admits several strings under each tag.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Tagged<S extends Lazy<DictionaryShape>> = {

	readonly [tag: Tag]: Eager<S> extends { readonly uniqueLang: true } ? string : readonly string[]

}

/**
 * Resolves the negotiated text a dictionary shape coalesces to.
 *
 * A localised member asked for by the atomic placeholder comes back as plain text: the content of the one tag that
 * language negotiation selects. The text is a single string where the shape states
 * {@link DictionaryConstraints.uniqueLang | uniqueLang}, and an array of strings otherwise, matching the per-tag arity
 * {@link Tagged} states for the map. A shape that leaves the constraint unstated, or states it only as a boolean, may
 * carry several strings under a tag, so its text is always an array, however many strings the selected tag holds.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Coalesced<S extends Lazy<DictionaryShape>> =
	Eager<S> extends { readonly uniqueLang: true } ? string : readonly string[]
