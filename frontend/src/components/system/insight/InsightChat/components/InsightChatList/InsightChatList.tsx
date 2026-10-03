import './.css'
import { Link } from 'react-router'
import type { InsightChatListItem } from '../../.ts'

const InsightChatList = ({ chats, newChatHref, newChatSelected }: { chats: InsightChatListItem[]; newChatHref: string; newChatSelected: boolean }) =>
  <aside className="insight-chat-list flex flex-none flex-col gap-4" aria-label="Chats">
    <Link to={newChatHref} className="insight-chat-list__new flex items-center gap-2 rounded-lg px-3 py-2" aria-current={newChatSelected ? 'page' : undefined}>
      <span className="material-symbols-outlined text-xl leading-none" aria-hidden="true">add</span>
      New chat
    </Link>
    {!!chats.length &&
      <nav className="flex min-h-0 flex-col gap-1" aria-label="Previous chats">
        <h2 className="insight-chat-list__label px-3">Chats</h2>
        <ul className="insight-chat-list__items flex flex-col gap-0.5 overflow-y-auto">
          {chats.map((chat) =>
            <li key={chat.id}>
              <Link to={chat.href} className="insight-chat-list__item block truncate rounded-md px-3 py-2" aria-current={chat.selected ? 'page' : undefined} title={chat.title}>
                {chat.title}
              </Link>
            </li>
          )}
        </ul>
      </nav>}
  </aside>

export default InsightChatList
