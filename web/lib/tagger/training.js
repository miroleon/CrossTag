// @ts-check
// Copied from miroleon/ai-showcase, src/lib/tagger/training.js, commit 6065cf3, without changes.
// Change it there first and copy it again, so the two copies stay the same. MIT License (see LICENSE).
/**
 * Settings files for training a LoRA on a bigger computer, written next to an exported dataset
 * (wiki/demos/workshop.md, step 3, "Image LoRA training elsewhere"; wiki/guides/workshop-training.md).
 *
 *   ai-toolkit (ostris)   a config for Z-Image Turbo, in the form ai-toolkit's own interface writes,
 *                         with the training adapter that keeps the Turbo model's few-step sampling
 *   kohya sd-scripts      a script for SDXL or SD 1.5 that reads the img/<repeats>_<name>/ folder
 *
 * The values come from the dataset (name, trigger word, number of pictures, captions for the sample
 * prompts). The tool versions are the ones the files were checked against; newer versions may rename
 * options. Part of the tagger library, which has no imports from the rest of the site (ADR 0031).
 */
import { withTrigger } from './captions.js';

/** The versions these files were written for, checked on 2026-11-25. */
export const TOOLS = {
  aiToolkit: { repo: 'https://github.com/ostris/ai-toolkit', commit: '73c84b091dd0f5647fc6a4b59122a2efc1c8147b' },
  sdScripts: { repo: 'https://github.com/kohya-ss/sd-scripts', tag: 'v0.13.1' },
  /** Keeps Z-Image Turbo's 8-step sampling while a LoRA trains on it (Apache-2.0). */
  zimageAdapter: 'ostris/zimage_turbo_training_adapter/zimage_turbo_training_adapter_v2.safetensors',
};

/** A YAML string: JSON's double-quoted strings are valid YAML and escape everything. @param {string} s */
const q = (s) => JSON.stringify(s);

/**
 * Training steps for ai-toolkit: about 100 per picture, from 1,000 to 3,000, in whole multiples of
 * 250 so that the files saved every 250 steps include the last one.
 * @param {number} pictures
 */
export function aiToolkitSteps(pictures) {
  const steps = Math.min(3000, Math.max(1000, pictures * 100));
  return Math.round(steps / 250) * 250;
}

/**
 * Up to three sample prompts from the dataset's own captions, each with the trigger word in front.
 * The trainer draws them every few hundred steps, so the run can be watched as in step 2's timeline.
 * @param {string[]} captions @param {string} trigger
 */
export function samplePrompts(captions, trigger) {
  const usable = captions.map((c) => c.trim()).filter(Boolean);
  const picked = usable.length ? usable.slice(0, 3) : [''];
  return picked.map((c) => withTrigger(c, trigger) || trigger || 'a photo');
}

/**
 * ai-toolkit's config for a Z-Image Turbo LoRA.
 * @param {{ name: string, folder: string, trigger: string, steps: number, prompts: string[] }} o
 *   folder: where the pictures and captions are, relative to the ai-toolkit folder
 */
export function aiToolkitConfig({ name, folder, trigger, steps, prompts }) {
  const lines = [
    `# ai-toolkit config for a Z-Image Turbo LoRA, written by the AI Showcase tagger.`,
    `# Checked against ${TOOLS.aiToolkit.repo} at commit ${TOOLS.aiToolkit.commit.slice(0, 7)}.`,
    `# Copy the dataset folder to ai-toolkit/${folder} and this file to ai-toolkit/config/,`,
    `# then run in the ai-toolkit folder: python run.py config/${name}.yaml`,
    `job: extension`,
    `config:`,
    `  name: ${q(name)}`,
    `  process:`,
    `    - type: diffusion_trainer`,
    `      training_folder: output`,
    `      device: cuda`,
    ...(trigger.trim() ? [`      trigger_word: ${q(trigger.trim())}`] : []),
    `      network:`,
    `        type: lora`,
    `        linear: 16`,
    `        linear_alpha: 16`,
    `      save:`,
    `        dtype: bf16`,
    `        # A file every 250 steps: step 2 of the workshop pages can show them as a timeline.`,
    `        save_every: 250`,
    `        max_step_saves_to_keep: 20`,
    `        save_format: diffusers`,
    `      datasets:`,
    `        - folder_path: ${q(folder)}`,
    `          caption_ext: txt`,
    `          caption_dropout_rate: 0.05`,
    `          resolution: [512, 768, 1024]`,
    `      train:`,
    `        batch_size: 1`,
    `        steps: ${steps}`,
    `        gradient_accumulation: 1`,
    `        train_unet: true`,
    `        train_text_encoder: false`,
    `        gradient_checkpointing: true`,
    `        noise_scheduler: flowmatch`,
    `        optimizer: adamw8bit`,
    `        timestep_type: weighted`,
    `        lr: 0.0001`,
    `        dtype: bf16`,
    `      model:`,
    `        name_or_path: Tongyi-MAI/Z-Image-Turbo`,
    `        arch: "zimage:turbo"`,
    `        # 8-bit weights and low_vram lower the memory the model needs on the graphics card.`,
    `        quantize: true`,
    `        qtype: qfloat8`,
    `        quantize_te: true`,
    `        qtype_te: qfloat8`,
    `        low_vram: true`,
    `        assistant_lora_path: ${TOOLS.zimageAdapter}`,
    `      sample:`,
    `        sampler: flowmatch`,
    `        sample_every: 250`,
    `        width: 1024`,
    `        height: 1024`,
    `        samples:`,
    ...prompts.map((p) => `          - prompt: ${q(p)}`),
    `        seed: 42`,
    `        walk_seed: false`,
    `        guidance_scale: 1`,
    `        sample_steps: 8`,
    `meta:`,
    `  name: ${q(name)}`,
    `  version: "1.0"`,
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * kohya sd-scripts commands for an SDXL or SD 1.5 LoRA, as a shell script (Mac, Linux) and a batch
 * file (Windows). Both read the img/ folder of the kohya export and the sample prompts next to them.
 * @param {{ name: string, target: 'sdxl' | 'sd15', epochs?: number }} o
 */
export function kohyaScripts({ name, target, epochs = 10 }) {
  const sdxl = target === 'sdxl';
  const script = sdxl ? 'sdxl_train_network.py' : 'train_network.py';
  const model = sdxl ? 'sd_xl_base_1.0.safetensors' : 'v1-5-pruned-emaonly.safetensors';
  const size = sdxl ? '1024,1024' : '512,512';
  // path(variable, rest): a quoted path in the script's own syntax, from MODEL or DATA. The 8-bit
  // optimizer (bitsandbytes) and bf16 need an NVIDIA card, so the shell script picks plain AdamW in
  // full precision on a Mac (checked on the owner's Mac mini, 2026-11-26).
  const args = (/** @type {(variable: string, rest?: string) => string} */ path, optimizer = 'AdamW8bit', precision = 'bf16') => [
    `--pretrained_model_name_or_path ${path('MODEL')}`,
    `--train_data_dir ${path('DATA', 'img')}`,
    `--caption_extension .txt`,
    `--resolution ${size}`,
    `--enable_bucket`,
    `--network_module networks.lora`,
    `--network_dim 16`,
    `--network_alpha 8`,
    // The text encoders stay as they are, so their outputs can be computed once (SDXL).
    ...(sdxl ? ['--network_train_unet_only', '--cache_text_encoder_outputs'] : []),
    `--cache_latents`,
    `--gradient_checkpointing`,
    `--train_batch_size 1`,
    `--learning_rate 1e-4`,
    `--optimizer_type ${optimizer}`,
    `--mixed_precision ${precision}`,
    `--max_train_epochs ${epochs}`,
    `--save_every_n_epochs 2`,
    `--save_model_as safetensors`,
    `--output_dir ${path('DATA', 'output')}`,
    `--output_name ${name}`,
    `--sample_prompts ${path('DATA', 'training/sample-prompts.txt')}`,
    `--sample_every_n_epochs 2`,
    `--sample_sampler euler_a`,
    `--seed 42`,
  ];
  const head = `kohya sd-scripts (${TOOLS.sdScripts.repo}, release ${TOOLS.sdScripts.tag}), written by the AI Showcase tagger.`;
  const sh = [
    '#!/bin/sh',
    `# ${head}`,
    '# Run it in the sd-scripts folder with its Python environment active.',
    `# MODEL: the ${sdxl ? 'SDXL' : 'SD 1.5'} checkpoint. DATA: this dataset folder (the one with img/ in it).`,
    `MODEL="\${MODEL:-$HOME/models/${model}}"`,
    'DATA="${DATA:-$(dirname "$0")/..}"',
    '# On a Mac the 8-bit optimizer and bf16 are missing; plain AdamW in full precision runs instead.',
    'if [ "$(uname)" = "Darwin" ]; then OPTIMIZER=AdamW; PRECISION=no; else OPTIMIZER=AdamW8bit; PRECISION=bf16; fi',
    `accelerate launch ${script} \\`,
    ...args((v, rest) => (rest ? `"$${v}/${rest}"` : `"$${v}"`), '"$OPTIMIZER"', '"$PRECISION"').map((a, j, all) => `  ${a}${j < all.length - 1 ? ' \\' : ''}`),
    '',
  ].join('\n');
  const bat = [
    '@echo off',
    `rem ${head}`,
    'rem Run it in the sd-scripts folder with its Python environment active.',
    `rem MODEL: the ${sdxl ? 'SDXL' : 'SD 1.5'} checkpoint. DATA: this dataset folder (the one with img\\ in it).`,
    `if "%MODEL%"=="" set MODEL=C:\\models\\${model}`,
    'if "%DATA%"=="" set DATA=%~dp0..',
    `accelerate launch ${script} ^`,
    ...args((v, rest) => (rest ? `"%${v}%\\${rest.replace(/\//g, '\\')}"` : `"%${v}%"`)).map((a, j, all) => `  ${a}${j < all.length - 1 ? ' ^' : ''}`),
    '',
  ].join('\r\n');
  return { sh, bat };
}

/**
 * The training files for one export layout.
 * @param {{ layout: string, root: string, target: string, trigger: string, captions: string[], readme: string }} o
 *   root: the dataset's folder name; readme: TRAINING.md, written by the page in its language
 * @returns {{ name: string, data: string }[]}
 */
export function trainingFiles({ layout, root, target, trigger, captions, readme }) {
  /** @type {{ name: string, data: string }[]} */
  const files = [];
  const prompts = samplePrompts(captions, trigger);
  if (layout === 'folder' && target === 'zimage') {
    files.push({
      name: `${root}/training/${root}.yaml`,
      data: aiToolkitConfig({ name: root, folder: `datasets/${root}`, trigger, steps: aiToolkitSteps(captions.length), prompts }),
    });
  }
  if (layout === 'kohya' && (target === 'sdxl' || target === 'sd15')) {
    const { sh, bat } = kohyaScripts({ name: root, target });
    files.push({ name: `${root}/training/train.sh`, data: sh }, { name: `${root}/training/train.bat`, data: bat });
    // kohya reads one prompt per line; "--n" would add a negative prompt, "--s" the steps.
    files.push({ name: `${root}/training/sample-prompts.txt`, data: `${prompts.map((p) => `${p} --s 28 --d 42`).join('\n')}\n` });
  }
  if (layout === 'folder' || layout === 'kohya') files.push({ name: `${root}/TRAINING.md`, data: readme });
  return files;
}
