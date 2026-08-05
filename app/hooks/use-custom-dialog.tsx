"use client";

/**
 * The app's imperative prompt/confirm dialogs.
 *
 * Instead of the browser's blocking `prompt()`/`confirm()`, the chat shell asks
 * for input through these, which render the themed <CustomDialog>. Pulled out of
 * chat-shell.tsx so all the modal bookkeeping (the pending options plus the two
 * callbacks) lives in one place; the shell just calls `showCustomPrompt` /
 * `showCustomConfirm` and drops `dialogElement` into its tree.
 */

import { useCallback, useState, type ReactNode } from "react";
import { CustomDialog, type DialogOptions } from "../components/custom-dialog";

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  onConfirm: (val?: string) => void;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  isDanger?: boolean;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  /** Runs when the cancel button (or backdrop) dismisses the dialog. */
  onCancel?: () => void;
}

export interface CustomDialogApi {
  showCustomPrompt: (options: PromptOptions) => void;
  showCustomConfirm: (options: ConfirmOptions) => void;
  /** Render this somewhere in the tree; it is the modal itself. */
  dialogElement: ReactNode;
}

export function useCustomDialog(): CustomDialogApi {
  const [dialogOptions, setDialogOptions] = useState<DialogOptions | null>(null);
  const [dialogCallback, setDialogCallback] = useState<
    ((val?: string) => void) | null
  >(null);
  const [dialogCancel, setDialogCancel] = useState<(() => void) | null>(null);

  const showCustomPrompt = useCallback((options: PromptOptions) => {
    setDialogOptions({ ...options, type: "prompt" });
    setDialogCallback(() => options.onConfirm);
    setDialogCancel(null);
  }, []);

  const showCustomConfirm = useCallback((options: ConfirmOptions) => {
    setDialogOptions({ ...options, type: "confirm" });
    setDialogCallback(() => () => options.onConfirm());
    setDialogCancel(() => options.onCancel || null);
  }, []);

  const dialogElement = dialogOptions ? (
    <CustomDialog
      options={dialogOptions}
      onConfirm={(val) => {
        // Clear first, THEN run the callback: a callback that opens another
        // dialog (name → background) would otherwise be wiped by these
        // resets, which is why "Next" appeared to do nothing.
        const callback = dialogCallback;
        setDialogOptions(null);
        setDialogCallback(null);
        setDialogCancel(null);
        callback?.(val);
      }}
      onCancel={() => {
        const cancel = dialogCancel;
        setDialogOptions(null);
        setDialogCallback(null);
        setDialogCancel(null);
        cancel?.();
      }}
    />
  ) : null;

  return { showCustomPrompt, showCustomConfirm, dialogElement };
}
