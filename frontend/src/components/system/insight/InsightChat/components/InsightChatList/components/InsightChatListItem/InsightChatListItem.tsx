import './.css'
import { Link } from 'react-router'
import type { InsightChatActions, InsightChatListItem as InsightChatListItemData } from '../../../../.ts'
import { useInsightChatListItem } from './.ts'
import InsightChatMenu from './components/InsightChatMenu/InsightChatMenu'

const InsightChatListItem = ({ chat, actions }: { chat: InsightChatListItemData; actions: InsightChatActions }) => {
  const item = useInsightChatListItem(chat, actions)

  if (item.editing) return <li className="insight-chat-list-item">
    <form onSubmit={item.save}>
      <input
        ref={item.inputRef}
        value={item.draft}
        onChange={(event) => item.setDraft(event.target.value)}
        onKeyDown={item.cancelOnEscape}
        onBlur={() => item.save()}
        maxLength={120}
        aria-label="Chat title"
        className="insight-chat-list-item__input w-full rounded-md px-3 py-2"
      />
    </form>
  </li>

  return <li className="insight-chat-list-item relative flex items-center" data-selected={chat.selected}>
    <Link to={chat.href} className="insight-chat-list-item__link flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-3 py-2" aria-current={chat.selected ? 'page' : undefined} title={chat.title}>
      {chat.pinned && <span className="material-symbols-outlined insight-chat-list-item__pin flex-none" aria-label="Pinned">keep</span>}
      <span className="truncate">{chat.title}</span>
    </Link>
    <InsightChatMenu title={chat.title} pinned={chat.pinned} onRename={item.startEditing} onTogglePin={item.togglePin} onDelete={item.remove} />
  </li>
}

export default InsightChatListItem
