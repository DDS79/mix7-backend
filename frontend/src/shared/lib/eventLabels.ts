export function getEventStatusLabel(
  status: 'draft' | 'published' | 'cancelled' | 'completed',
) {
  switch (status) {
    case 'draft':
      return 'Черновик';
    case 'published':
      return 'Опубликовано';
    case 'cancelled':
      return 'Отменено';
    case 'completed':
      return 'Завершено';
  }
}

export function getEventVisibilityLabel(
  visibility: 'public' | 'private' | 'members_only' | 'invite_only',
) {
  switch (visibility) {
    case 'public':
      return 'Публичное';
    case 'private':
      return 'Скрытое';
    case 'members_only':
      return 'Только для участников клуба';
    case 'invite_only':
      return 'По приглашению';
  }
}

export function getEventSalesLabel(salesOpen: boolean) {
  return salesOpen ? 'Продажи открыты' : 'Продажи закрыты';
}

export function getArchivedLabel() {
  return 'В архиве';
}
