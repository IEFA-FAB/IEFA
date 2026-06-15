-- piece.tipo passa a ser opcional (nullable)
alter table rumaer.piece
	alter column tipo drop not null;
