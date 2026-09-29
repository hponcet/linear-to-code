import { lazy, Suspense, useMemo } from "react"
import { Popover, Whisper, type WhisperProps } from "rsuite"
import { SerializedReaction } from "src/types/SerializedLinear"
import { useVsCodeTheme } from "src/webviews/hooks/useVsCodeTheme"

import { Emoji } from "./Emoji"

import { Button } from "../Button/Button"
import { EmojiIcon } from "../Icons/EmojiIcon"

import type { EmojiClickData } from "emoji-picker-react"

import "./EmojiPicker.scss"

const PICKER_WIDTH = 230
const PICKER_HEIGHT = 270

type PickerProps = {
  light: boolean
  onEmojiClick: (emoji: EmojiClickData) => void
}

// The picker library is large and only shows after a click, so it loads when its button is
// hovered or focused. The fallback keeps the popover at the picker's size while it arrives.
const loadEmojiPicker = () => import("emoji-picker-react")

const Picker = lazy(async () => {
  const { default: EmojiPickerReact, EmojiStyle, Theme } = await loadEmojiPicker()

  function ConfiguredPicker({ light, onEmojiClick }: PickerProps) {
    return (
      <EmojiPickerReact
        onEmojiClick={onEmojiClick}
        width={PICKER_WIDTH}
        height={PICKER_HEIGHT}
        theme={light ? Theme.LIGHT : Theme.DARK}
        emojiStyle={EmojiStyle.NATIVE}
        previewConfig={{ showPreview: false }}
        skinTonesDisabled
        autoFocusSearch={false}
        open
      />
    )
  }

  return { default: ConfiguredPicker }
})

type EmojiPickerProps = {
  onSelect?: (emoji: string) => void
  onUnselect?: (id: string) => void
  size?: number
  reactions?: SerializedReaction[]
  placement?: WhisperProps["placement"]
  editorSurface?: boolean
}

export function EmojiPicker(props: EmojiPickerProps) {
  const { onSelect, onUnselect, size, reactions, placement = "bottomEnd", editorSurface } = props
  const actionLabel = editorSurface ? "Insert emoji" : "Add reaction"
  const vsCodeTheme = useVsCodeTheme()
  const groupedReactions = useMemo(
    () =>
      reactions?.reduce(
        (acc, reaction) => {
          if (!acc[reaction.emoji]) {
            acc[reaction.emoji] = []
          }
          acc[reaction.emoji].push(reaction)
          return acc
        },
        {} as Record<string, SerializedReaction[]>,
      ),
    [reactions],
  )

  const renderSpeaker = ({ onClose, ...rest }: any, ref: any) => {
    return (
      <Popover
        data-linear-editor-ui={editorSurface ? "" : undefined}
        ref={ref}
        full
        arrow={false}
        style={{
          padding: 0,
          border: "none",
          backgroundColor: "transparent",
        }}
        onClose={onClose}
        {...rest}
      >
        <Suspense fallback={<div style={{ width: PICKER_WIDTH, height: PICKER_HEIGHT }} />}>
          <Picker
            light={vsCodeTheme === "light"}
            onEmojiClick={(emoji) => {
              onSelect?.(editorSurface ? emoji.emoji : emoji.unified)
              onClose()
            }}
          />
        </Suspense>
      </Popover>
    )
  }

  return (
    <div className="emojiPickerContainer">
      {groupedReactions ? (
        <div className="emojiPickerReactions">
          {Object.entries(groupedReactions).map(([emoji, r]) => (
            <Emoji
              key={emoji}
              emoji={emoji}
              reactions={r}
              add={() => onSelect?.(emoji)}
              remove={onUnselect}
            />
          ))}
        </div>
      ) : null}
      <Whisper
        trigger="click"
        controlId="control-id-click"
        placement={placement}
        speaker={renderSpeaker}
        preventOverflow
      >
        <span onPointerEnter={loadEmojiPicker} onFocus={loadEmojiPicker}>
          <Button appearance="subtle" aria-label={actionLabel} tooltip={actionLabel}>
            <EmojiIcon size={size} />
          </Button>
        </span>
      </Whisper>
    </div>
  )
}
