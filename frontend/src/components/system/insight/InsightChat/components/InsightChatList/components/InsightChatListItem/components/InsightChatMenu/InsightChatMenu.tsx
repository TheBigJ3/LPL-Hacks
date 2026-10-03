import './.css'
import { AnimatePresence, motion } from 'motion/react'
import { INSIGHT_CHAT_MENU_VARIANTS, useInsightChatMenu } from './.ts'

type InsightChatMenuProps = {
  title: string
  pinned: boolean
  onRename: () => void
  onTogglePin: () => void
  onDelete: () => void
}

const InsightChatMenu = ({ title, pinned, onRename, onTogglePin, onDelete }: InsightChatMenuProps) => {
  const menu = useInsightChatMenu(onRename, onTogglePin, onDelete)

  return <div ref={menu.rootRef} className="insight-chat-menu absolute right-1 flex-none" data-open={menu.open} onKeyDown={menu.closeOnEscape}>
    <button
      ref={menu.buttonRef}
      type="button"
      className="insight-chat-menu__button grid place-items-center rounded-md"
      aria-label={`More options for ${title}`}
      aria-haspopup="true"
      aria-expanded={menu.open}
      onClick={menu.toggle}
    >
      <span className="material-symbols-outlined" aria-hidden="true">more_vert</span>
    </button>
    <AnimatePresence>
      {menu.position &&
        <motion.div className="insight-chat-menu__popover fixed z-30 rounded-lg p-1" style={menu.position} variants={INSIGHT_CHAT_MENU_VARIANTS} initial="closed" animate="open" exit="closed">
          <button type="button" className="insight-chat-menu__item flex h-9 w-full items-center gap-2 rounded-md px-2" onClick={menu.rename}>
            <span className="material-symbols-outlined insight-chat-menu__icon" aria-hidden="true">edit</span>
            Edit title
          </button>
          <button type="button" className="insight-chat-menu__item flex h-9 w-full items-center gap-2 rounded-md px-2" onClick={menu.togglePin}>
            <span className="material-symbols-outlined insight-chat-menu__icon" aria-hidden="true">{pinned ? 'keep_off' : 'keep'}</span>
            {pinned ? 'Unpin' : 'Pin to top'}
          </button>
          <button type="button" className="insight-chat-menu__item insight-chat-menu__item-danger flex h-9 w-full items-center gap-2 rounded-md px-2" onClick={menu.remove}>
            <span className="material-symbols-outlined insight-chat-menu__icon" aria-hidden="true">delete</span>
            Delete chat
          </button>
        </motion.div>}
    </AnimatePresence>
  </div>
}

export default InsightChatMenu
