"use client";

import { useState, useMemo } from "react";
import { Scale, ExternalLink, ShieldCheck, Search, ChevronDown, ChevronUp, Code2, Heart } from "lucide-react";

interface ThirdPartyPackage {
  name: string;
  category: "Core & UI" | "Audio & Graphics" | "Documents & Tools" | "Platform & Services";
  license: "MIT" | "Apache-2.0" | "ISC" | "LGPL / GPL" | "The Unlicense";
  licenseUrl: string;
  author: string;
  description: string;
  projectUrl: string;
}

const THIRD_PARTY_PACKAGES: ThirdPartyPackage[] = [
  {
    name: "React & React DOM",
    category: "Core & UI",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
    author: "Meta Platforms, Inc.",
    description: "The library for web and native user interfaces.",
    projectUrl: "https://react.dev",
  },
  {
    name: "Lucide React",
    category: "Core & UI",
    license: "ISC",
    licenseUrl: "https://opensource.org/licenses/ISC",
    author: "Lucide Contributors",
    description: "Beautiful & consistent icons crafted for modern interfaces.",
    projectUrl: "https://lucide.dev",
  },
  {
    name: "Tailwind CSS",
    category: "Core & UI",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
    author: "Tailwind Labs, Inc.",
    description: "Utility-first CSS framework for rapid UI styling.",
    projectUrl: "https://tailwindcss.com",
  },
  {
    name: "Three.js",
    category: "Audio & Graphics",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
    author: "Ricardo Cabello (mrdoob) & contributors",
    description: "JavaScript 3D library used for tabletop dice rendering and 3D visualizers.",
    projectUrl: "https://threejs.org",
  },
  {
    name: "@3d-dice/dice-box",
    category: "Audio & Graphics",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
    author: "Frank S",
    description: "3D physics-based dice rolling engine for the tabletop game room.",
    projectUrl: "https://github.com/3d-dice/dice-box",
  },
  {
    name: "RNNoise",
    category: "Audio & Graphics",
    license: "Apache-2.0",
    licenseUrl: "https://www.apache.org/licenses/LICENSE-2.0",
    author: "Jean-Marc Valin / Xiph.Org Foundation",
    description: "Recurrent neural network for real-time microphone noise suppression.",
    projectUrl: "https://github.com/xiph/rnnoise",
  },
  {
    name: "pdf-lib & fontkit",
    category: "Documents & Tools",
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
    author: "Andrew Dillon (Hopding) & fontkit contributors",
    description: "PDF creation and modification library for interactive character sheets and handouts.",
    projectUrl: "https://pdf-lib.js.org",
  },
  {
    name: "PDF.js (pdfjs-dist)",
    category: "Documents & Tools",
    license: "Apache-2.0",
    licenseUrl: "https://www.apache.org/licenses/LICENSE-2.0",
    author: "Mozilla Foundation",
    description: "Standards-based PDF viewer and canvas rendering engine.",
    projectUrl: "https://mozilla.github.io/pdf.js/",
  },
  {
    name: "yt-dlp",
    category: "Platform & Services",
    license: "The Unlicense",
    licenseUrl: "https://unlicense.org",
    author: "yt-dlp contributors",
    description: "Command-line media extractor powering the self-hosted music resolver bot.",
    projectUrl: "https://github.com/yt-dlp/yt-dlp",
  },
  {
    name: "FFmpeg",
    category: "Platform & Services",
    license: "LGPL / GPL",
    licenseUrl: "https://www.ffmpeg.org/legal.html",
    author: "FFmpeg team",
    description: "Cross-platform audio and video processing framework.",
    projectUrl: "https://ffmpeg.org",
  },
  {
    name: "Discord.js",
    category: "Platform & Services",
    license: "Apache-2.0",
    licenseUrl: "https://www.apache.org/licenses/LICENSE-2.0",
    author: "Discord.js contributors",
    description: "JavaScript interface powering the optional bidirectional Discord chat bridge.",
    projectUrl: "https://discord.js.org",
  },
  {
    name: "Cloudflare Wrangler & Workers",
    category: "Platform & Services",
    license: "Apache-2.0",
    licenseUrl: "https://www.apache.org/licenses/LICENSE-2.0",
    author: "Cloudflare, Inc.",
    description: "Developer tooling and runtime environment for local and edge service orchestration.",
    projectUrl: "https://developers.cloudflare.com/workers/",
  },
];

const AGPL_SUMMARY = [
  {
    title: "Freedom to Run & Self-Host",
    desc: "You can run Hoffle on your own private hardware, VPS, or cloud server for your community without paying license fees.",
  },
  {
    title: "Freedom to Inspect & Modify",
    desc: "You have complete access to the source code and can adapt it, add custom bot commands, or customize the UI.",
  },
  {
    title: "Copyleft Network Clause (Section 13)",
    desc: "If you modify Hoffle and offer it as a service over a network, you must provide your modified source code to everyone interacting with it.",
  },
  {
    title: "No Warranty",
    desc: "Hoffle is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY of merchantability or fitness for a particular purpose.",
  },
];

export function LicensesTab() {
  const [showFullAgpl, setShowFullAgpl] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const categories = ["all", "Core & UI", "Audio & Graphics", "Documents & Tools", "Platform & Services"];

  const filteredPackages = useMemo(() => {
    return THIRD_PARTY_PACKAGES.filter((pkg) => {
      const matchesCategory = selectedCategory === "all" || pkg.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        pkg.name.toLowerCase().includes(q) ||
        pkg.license.toLowerCase().includes(q) ||
        pkg.author.toLowerCase().includes(q) ||
        pkg.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <div className="licenses-tab space-y-6 text-sm text-[#dbdee1]">
      {/* Hoffle Main License Hero */}
      <div className="rounded-xl border border-[#5865f2]/30 bg-gradient-to-br from-[#5865f2]/10 via-[#2b2d31] to-[#1e1f22] p-5 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#5865f2] text-white shadow-md">
              <Scale size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Hoffle Self-Hosted Platform</h3>
                <span className="rounded bg-[#5865f2]/30 px-2 py-0.5 text-xs font-semibold text-[#a5b4fc] border border-[#5865f2]/50">
                  GNU AGPLv3
                </span>
              </div>
              <p className="text-xs text-[#949ba4] mt-0.5">
                Copyright © 2026 coxaexs &lt;coxaexs@gmail.com&gt; · Free & Open Source
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://github.com/Coxaexs/huddle"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#35373c] hover:bg-[#3e4046] px-3 py-1.5 text-xs font-medium text-white transition-colors"
            >
              <Code2 size={14} /> Source Code <ExternalLink size={12} className="opacity-70" />
            </a>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-[#c4c9ce]">
          Hoffle is licensed under the <strong>GNU Affero General Public License Version 3 (GNU AGPLv3)</strong>.
          As a self-hosted platform, this ensures that Hoffle remains free and open source forever, protecting user
          freedom across both private server deployments and networked services.
        </p>

        {/* AGPL Key Highlights */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {AGPL_SUMMARY.map((item) => (
            <div key={item.title} className="rounded-lg bg-[#232428]/80 p-2.5 border border-[#3f4147]/40">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#f2f3f5]">
                <ShieldCheck size={14} className="text-[#5865f2]" />
                {item.title}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[#949ba4]">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* AGPL Full Text Accordion */}
        <div className="mt-4 pt-3 border-t border-[#3f4147]/50 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowFullAgpl(!showFullAgpl)}
            className="flex items-center justify-between text-xs font-medium text-[#a5b4fc] hover:text-white transition-colors w-full text-left"
          >
            <span className="flex items-center gap-1.5">
              <Scale size={14} /> {showFullAgpl ? "Hide full GNU AGPLv3 text" : "Read full GNU AGPLv3 terms and conditions"}
            </span>
            {showFullAgpl ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showFullAgpl && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-lg bg-[#18191c] p-3 text-[11px] font-mono text-[#b5bac1] leading-relaxed border border-[#3f4147]/60 select-text whitespace-pre-wrap">
{`                    GNU AFFERO GENERAL PUBLIC LICENSE
                       Version 3, 19 November 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.

                            Preamble

  The GNU Affero General Public License is a free, copyleft license for
software and other kinds of works, specifically designed to ensure
cooperation with the community in the case of network server software.

  The GNU Affero General Public License is designed specifically to ensure
that, in such cases, the modified source code becomes available to the
community. It requires the operator of a network server to provide the
source code of the modified version running there to the users of that
server. Therefore, public use of a modified version, on a publicly
accessible server, gives the public access to the source code of the
modified version.

Section 13: Remote Network Interaction; Use with the GNU General Public License.
  Notwithstanding any other provision of this License, if you modify the
Program, your modified version must prominently offer all users
interacting with it remotely through a computer network (if your version
supports such interaction) an opportunity to receive the Corresponding
Source of your version by providing access to the Corresponding Source
from a network server at no charge, through some standard or customary
means of facilitating copying of software.

The complete license text is available in the root LICENSE file of this
repository, or online at: https://www.gnu.org/licenses/agpl-3.0.html`}
            </div>
          )}
        </div>
      </div>

      {/* Third Party Open Source Attributions */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Heart size={15} className="text-red-400" /> Third-Party Open Source Attributions
            </h4>
            <p className="text-xs text-[#949ba4]">
              Hoffle is made possible by these essential open source projects and libraries.
            </p>
          </div>

          <div className="relative min-w-[200px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#80848e]" />
            <input
              type="text"
              placeholder="Search dependencies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md bg-[#1e1f22] border border-[#3f4147] py-1.5 pl-8 pr-3 text-xs text-white placeholder-[#80848e] focus:border-[#5865f2] focus:outline-none"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-[#5865f2] text-white"
                  : "bg-[#2b2d31] text-[#949ba4] hover:bg-[#35373c] hover:text-white"
              }`}
            >
              {cat === "all" ? "All Packages" : cat}
            </button>
          ))}
        </div>

        {/* Package Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {filteredPackages.map((pkg) => (
            <div
              key={pkg.name}
              className="rounded-lg border border-[#3f4147]/50 bg-[#2b2d31]/80 hover:bg-[#2b2d31] p-3 transition-colors flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-white text-xs">{pkg.name}</span>
                  <a
                    href={pkg.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-[#1e1f22] border border-[#3f4147] px-1.5 py-0.5 text-[10px] font-mono font-medium text-[#5865f2] hover:text-[#7983f5]"
                  >
                    {pkg.license} <ExternalLink size={10} />
                  </a>
                </div>
                <div className="text-[11px] text-[#80848e] mt-0.5">{pkg.author}</div>
                <p className="text-xs text-[#c4c9ce] mt-1.5 line-clamp-2 leading-relaxed">
                  {pkg.description}
                </p>
              </div>

              <div className="mt-2.5 pt-2 border-t border-[#3f4147]/30 flex items-center justify-between text-[11px]">
                <span className="text-[#80848e]">{pkg.category}</span>
                <a
                  href={pkg.projectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#949ba4] hover:text-white inline-flex items-center gap-1 transition-colors"
                >
                  Visit Project <ExternalLink size={11} />
                </a>
              </div>
            </div>
          ))}

          {filteredPackages.length === 0 && (
            <div className="col-span-full py-8 text-center text-xs text-[#80848e]">
              No dependencies found matching &quot;{searchQuery}&quot;.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
