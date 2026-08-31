-- Si el planificador combina disciplinas compatibles el mismo día. Default
-- true: quien declara varias disciplinas suele querer concentrarlas.
ALTER TABLE "profiles" ADD COLUMN "compact_days" BOOLEAN NOT NULL DEFAULT true;
