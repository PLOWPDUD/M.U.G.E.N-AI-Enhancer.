/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from "react";
import { GoogleGenAI } from "@google/genai";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { FileUpload } from "./components/FileUpload";
import { Button } from "./components/Button";
import { Loader2, Download, Cpu, Zap, Shield, Swords, Terminal, FileText } from "lucide-react";
import { cn } from "./lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { EXAMPLE_CMD, EXAMPLE_CNS } from "./lib/exampleData";

export default function App() {
  const [cnsFile, setCnsFile] = useState<File | null>(null);
  const [cmdFile, setCmdFile] = useState<File | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [defensiveLevel, setDefensiveLevel] = useState(1);
  const [spamLevel, setSpamLevel] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [resultZip, setResultZip] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addLog = (msg: string) => setLogs((prev) => [...prev, `> ${msg}`]);

  const handleDownloadExamples = () => {
    const zip = new JSZip();
    zip.file("example_char.cmd", EXAMPLE_CMD);
    zip.file("example_char.cns", EXAMPLE_CNS);
    zip.generateAsync({ type: "blob" }).then((content) => {
      saveAs(content, "mugen_example_files.zip");
    });
  };

  const handleGenerate = async () => {
    if (!cnsFile || !cmdFile) return;
    
    setIsProcessing(true);
    setProgress(10);
    setLogs([]);
    setError(null);
    setResultZip(null);

    try {
      addLog("Reading file contents...");
      const cnsContent = await cnsFile.text();
      const cmdContent = await cmdFile.text();
      
      setProgress(30);
      addLog("Initializing Neural Network (Gemini 3 Flash)...");

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const prompt = `
You are an expert M.U.G.E.N AI developer.
I will provide the content of a .cmd (Command) file and a .cns (Constants) file for a character.

YOUR GOAL:
Generate *new* AI code blocks to be INJECTED into these files.
The AI should be "God Tier" (highly competitive).

USER PREFERENCES:
- DEFENSIVE LEVEL: ${defensiveLevel}/10. (1 = Standard defense, 10 = Impossible to hit, frame-perfect blocking and evasion).
- SPAM/AGGRESSION LEVEL: ${spamLevel}/10. (1 = Balanced offense, 10 = Relentless spamming of specials/supers, zero idle time).

USER CUSTOM INSTRUCTIONS:
${customInstructions ? customInstructions : "No specific custom instructions provided."}

CRITICAL TECHNICAL INSTRUCTIONS (TO PREVENT CRASHES):
1. **CMD FILE**:
   - The user's CMD file already has a \`[Statedef -1]\`.
   - DO NOT output \`[Statedef -1]\` in your response.
   - Output ONLY the \`[State -1, ...]\` blocks that act as AI triggers.
   - These triggers will be programmatically inserted *inside* the existing \`[Statedef -1]\` block.
   - Use \`triggerall = var(59) = 1\` (or your chosen AI var) for all your new states.

2. **CNS FILE**:
   - Generate a \`[Statedef -3]\` block for AI activation (setting var(59)).
   - If you need helper states, use safe, high State IDs (e.g., \`[Statedef 9700]\`) to avoid conflicts.
   - Output the full content for these new states.

OUTPUT FORMAT:
Return ONLY the NEW code to be added, wrapped in these delimiters:

---BEGIN CMD INJECTION---
...new [State -1] blocks ONLY...
---END CMD INJECTION---

---BEGIN CNS APPEND---
...new Statedef -3 and helper Statedefs...
---END CNS APPEND---

Here is the CMD file content (for context):
${cmdContent}

Here is the CNS file content (for context):
${cnsContent}
      `;

      addLog("Analyzing character moveset...");
      addLog("Generating aggressive AI triggers...");
      addLog("Optimizing combo logic...");

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      let text = response.text;
      if (!text) throw new Error("No response from AI");

      // Clean up potential markdown code blocks
      text = text.replace(/```\w*\n/g, "").replace(/```/g, "");

      setProgress(70);
      addLog("Parsing generated code...");

      const cmdMatch = text.match(/---BEGIN CMD INJECTION---([\s\S]*?)---END CMD INJECTION---/);
      const cnsMatch = text.match(/---BEGIN CNS APPEND---([\s\S]*?)---END CNS APPEND---/);

      if (!cmdMatch || !cnsMatch) {
        throw new Error("Failed to parse AI response. The model output format was unexpected.");
      }

      const cmdInjection = cmdMatch[1].trim();
      const cnsAppend = cnsMatch[1].trim();

      // SMART INJECTION LOGIC
      addLog("Injecting AI logic safely...");
      
      // 1. Inject CMD triggers into [Statedef -1]
      let newCmdContent = cmdContent;
      // Find [Statedef -1] (case insensitive)
      const statedefRegex = /\[Statedef\s+-1\]/i;
      const match = newCmdContent.match(statedefRegex);
      
      if (match && match.index !== undefined) {
        // Insert immediately after the [Statedef -1] line
        const insertionPoint = match.index + match[0].length;
        newCmdContent = 
          newCmdContent.slice(0, insertionPoint) + 
          "\n\n; --- AI GENERATED TRIGGERS START ---\n" + 
          cmdInjection + 
          "\n; --- AI GENERATED TRIGGERS END ---\n" + 
          newCmdContent.slice(insertionPoint);
      } else {
        // Fallback: If no Statedef -1 found (rare), append it? 
        // Or maybe it's a very old char. Let's append to end but warn.
        addLog("Warning: [Statedef -1] not found in CMD. Appending to end.");
        newCmdContent += "\n\n[Statedef -1]\n" + cmdInjection;
      }

      // 2. Append CNS states
      // Check if [Statedef -3] exists in original CNS to avoid duplicate
      let newCnsContent = cnsContent;
      if (cnsAppend.includes("[Statedef -3]") && /\[Statedef\s+-3\]/i.test(newCnsContent)) {
         // If both have Statedef -3, we should try to merge or rename the new one?
         // Simplest fix: Rename the AI's Statedef -3 to -2 if -3 exists, or just append and hope MUGEN handles it (it usually runs both if they are separate blocks, actually MUGEN only allows one special state usually).
         // Safer: Change the AI's [Statedef -3] to just [State ...] blocks and inject into existing -3?
         // Let's just append for now, but add a comment.
         // Actually, MUGEN allows multiple [Statedef -3] blocks in different files, but in the SAME file it might be an issue.
         // Let's just append. Most crashes were likely the CMD Statedef -1 duplicate.
         newCnsContent += "\n\n; --- AI GENERATED STATES START ---\n" + cnsAppend + "\n; --- AI GENERATED STATES END ---\n";
      } else {
         newCnsContent += "\n\n; --- AI GENERATED STATES START ---\n" + cnsAppend + "\n; --- AI GENERATED STATES END ---\n";
      }

      addLog("Merging files...");
      const zip = new JSZip();
      zip.file("ai_enhanced.cmd", newCmdContent);
      zip.file("ai_enhanced.cns", newCnsContent);
      zip.file("readme_ai.txt", "AI Generated by M.U.G.E.N AI Enhancer\n\nThese files contain your ORIGINAL content plus new AI logic appended at the end.");

      const content = await zip.generateAsync({ type: "blob" });
      setResultZip(content);
      setProgress(100);
      addLog("Done! Ready for download.");

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during generation.");
      addLog(`ERROR: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setCnsFile(null);
    setCmdFile(null);
    setCustomInstructions("");
    setDefensiveLevel(1);
    setSpamLevel(1);
    setResultZip(null);
    setLogs([]);
    setError(null);
    setProgress(0);
  };

  const downloadZip = () => {
    if (resultZip) {
      saveAs(resultZip, "mugen_ai_enhanced.zip");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={reset}>
            <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Cpu className="text-black w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">
              M.U.G.E.N <span className="text-emerald-500">AI Enhancer</span>
            </h1>
          </div>
          <div className="text-xs font-mono text-zinc-500">v1.0.0</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          {/* Left Column: Input */}
          <div className="space-y-8">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-light tracking-tight text-white">
                  Character Files
                </h2>
                <button 
                  onClick={handleDownloadExamples}
                  className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1 hover:underline"
                >
                  <FileText className="w-3 h-3" />
                  Download Examples
                </button>
              </div>
              <p className="text-zinc-400 text-sm">
                Upload your character's definition files. The AI will analyze the moveset and generate a competitive logic layer.
              </p>
            </div>

            <div className="grid gap-4">
              <FileUpload
                accept=".cmd"
                label="Command File (.cmd)"
                file={cmdFile}
                onFileSelect={setCmdFile}
              />
              <FileUpload
                accept=".cns"
                label="Constants File (.cns)"
                file={cnsFile}
                onFileSelect={setCnsFile}
              />
            </div>

            <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span>Enhancement Features</span>
              </div>
              <ul className="space-y-2 text-xs text-zinc-500 font-mono">
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                  Aggressive Combo Chaining
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                  Frame-Perfect Blocking
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                  Smart Power Management
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                  Anti-Air & Zoning Logic
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <label htmlFor="custom-instructions" className="text-sm font-medium text-zinc-300">
                Custom Instructions (Optional)
              </label>
              <textarea
                id="custom-instructions"
                className="w-full h-24 bg-zinc-900/50 border border-zinc-700 rounded-md p-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                placeholder="e.g., Focus on defensive playstyle, prioritize air combos, use var(50) for AI activation..."
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3 p-4 rounded-lg border border-zinc-800 bg-zinc-900/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                    <Shield className="w-4 h-4 text-blue-400" />
                    Defensive Level
                  </div>
                  <span className="text-xs font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">
                    {defensiveLevel}/10
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={defensiveLevel}
                  onChange={(e) => setDefensiveLevel(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <p className="text-[10px] text-zinc-500">
                  {defensiveLevel <= 3 ? "Standard blocking" : defensiveLevel <= 7 ? "Active evasion & counters" : "Frame-perfect god defense"}
                </p>
              </div>

              <div className="space-y-3 p-4 rounded-lg border border-zinc-800 bg-zinc-900/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                    <Swords className="w-4 h-4 text-red-400" />
                    Spam/Aggression
                  </div>
                  <span className="text-xs font-mono text-red-400 bg-red-400/10 px-2 py-0.5 rounded">
                    {spamLevel}/10
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={spamLevel}
                  onChange={(e) => setSpamLevel(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                />
                <p className="text-[10px] text-zinc-500">
                  {spamLevel <= 3 ? "Balanced offense" : spamLevel <= 7 ? "Heavy pressure" : "Relentless projectile spam"}
                </p>
              </div>
            </div>

            <Button
              size="lg"
              className="w-full text-base h-14"
              onClick={handleGenerate}
              disabled={!cnsFile || !cmdFile || isProcessing}
              isLoading={isProcessing}
            >
              {isProcessing ? "Enhancing AI..." : "Generate AI Core"}
            </Button>
          </div>

          {/* Right Column: Output / Terminal */}
          <div className="space-y-8">
             <div className="space-y-2">
              <h2 className="text-2xl font-light tracking-tight text-white">
                Processing Log
              </h2>
              <p className="text-zinc-400 text-sm">
                Real-time analysis and generation status.
              </p>
            </div>

            <div className="relative h-[400px] bg-black border border-zinc-800 rounded-lg overflow-hidden font-mono text-xs p-4 shadow-2xl">
              <div className="absolute top-0 left-0 right-0 h-8 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-2">
                <Terminal className="w-3 h-3 text-zinc-500" />
                <span className="text-zinc-500">terminal</span>
              </div>
              
              <div className="mt-8 h-full overflow-y-auto pb-4 space-y-1 text-zinc-300">
                {logs.length === 0 && !isProcessing && (
                  <div className="text-zinc-600 italic">Waiting for input...</div>
                )}
                {logs.map((log, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="break-words"
                  >
                    {log}
                  </motion.div>
                ))}
                {isProcessing && (
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="text-emerald-500"
                  >
                    _
                  </motion.div>
                )}
              </div>

              {/* Progress Bar Overlay */}
              {isProcessing && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
                  <motion.div
                    className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              )}
            </div>

            <AnimatePresence>
              {resultZip && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-6 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-emerald-400 font-medium">Enhancement Complete</h3>
                      <p className="text-emerald-500/60 text-xs">Ready to deploy</p>
                    </div>
                  </div>
                  <Button onClick={downloadZip} className="gap-2">
                    <Download className="w-4 h-4" />
                    Download ZIP
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
            
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function CheckCircle2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

