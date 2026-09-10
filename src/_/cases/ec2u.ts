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
import { id, markdown, optional, required, resource, text } from "../_.js";
import { Point, wgs } from "./wgs.js";


export const base = "https://data.ec2u.eu"; // the EC2U Knowledge Hub id space

export const ec2u = createNamespace(`${base}/terms#`);
export const rdfs = createNamespace("http://www.w3.org/2000/01/rdf-schema#");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function Entity() {
	return resource({

		id: id(),

		label: required(text()),
		comment: optional(markdown())

	}, {

		space: rdfs

	});
}

export function Feature() {
	return resource(Entity, Point, {}, {

		space: wgs

	});
}
