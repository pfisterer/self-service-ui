import { html } from 'htm/preact';
import { CodeBlock } from '../helper/codeblock.js';

// ----------------------------------------
// Show Keys
// ----------------------------------------
export function ShowKeys({ zone }) {
    const { zone_keys } = zone;

    return html`
        <div class="panel-block">
            This zone has ${zone_keys.length} key${zone_keys.length !== 1 ? 's' : ''} configured.
        </div>

        ${zone_keys.map((key, index) => html`
            <div class="panel-block is-block">
                <div class="box" style="border-radius: 12px;">

                    <h2 class="subtitle mb-4">Key #${index + 1}</h2>
                    
                    <div class="table-container"> 
                        <table class="table is-narrow">
                            <tbody>
                                <tr>
                                    <th style="width: 150px;">Keyname</th>
                                    <td><${CodeBlock} code=${key.keyname} /> </td>
                                </tr>
                                <tr>
                                    <th>Algorithm</th>
                                    <td><${CodeBlock} code=${key.algorithm} /> </td>
                                </tr>
                                <tr>
                                    <th>Key</th>
                                    <td><${CodeBlock} code=${key.key} /> </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `)}
    `;
}
