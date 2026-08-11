function toMeta(doc) {
  return {
    id: doc.id,
    title: doc.title,
    emoji: doc.emoji,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    isFavorite: doc.isFavorite,
    folderId: doc.folderId ?? null
  };
}
export {
  toMeta
};
