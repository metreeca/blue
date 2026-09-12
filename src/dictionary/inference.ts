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
 * Resolves the value a dictionary shape describes: `Tagged` maps a shape to the tag-keyed record its content is read
 * as, typed at the per-tag arity the shape admits.
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
