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

import { createNamespace } from "@metreeca/core/resource";
import type { Instance } from "../_/_.js";
import { reference } from "../_/reference.js";
import { multiple, optional, required, resource } from "../_/resource.js";
import { markdown, string, text } from "../_/string.js";


export const skos = createNamespace("http://www.w3.org/2004/02/skos/core#");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export type Concept = Instance<typeof Concept>

const c: Concept = {
	prefLabel: "Concept",
	inScheme: "https://example.org/schemes/concepts"
};


export function ConceptScheme() {
	return resource({

		hasTopConcept: multiple(reference(Concept), {

			foreign: true,

			reverse: skos.topConceptOf

		}),

		hasConcept: multiple(reference(Concept), {

			hidden: true,
			foreign: true,

			reverse: skos.inScheme

		})

	}, {

		space: skos,
		class: skos.ConceptScheme

	});

}

export function Concept() {
	return resource({

		notation: optional(string),

		prefLabel: required(text),
		altLabel: multiple(text),
		hiddenLabel: multiple(text),
		definition: optional(markdown),

		inScheme: required(reference(ConceptScheme)),

		topConceptOf: optional(reference(ConceptScheme), {

			forward: skos,
			reverse: skos.hasTopConcept

		}),

		broader: multiple(reference(Concept), {

			forward: skos,
			reverse: skos.narrower

		}),

		broaderTransitive: multiple(reference(Concept)),

		narrower: multiple(reference(Concept), {

			foreign: true

		}),

		related: multiple(reference(Concept), {

			forward: skos,
			reverse: skos

		}),

		exactMatch: multiple(reference(Concept), {

			forward: skos,
			reverse: skos

		})

	}, {

		space: skos,
		class: skos.Concept

	});
}
