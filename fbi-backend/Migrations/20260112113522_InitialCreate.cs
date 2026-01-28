using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace FbiApi.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WantedPersons",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ExternalId = table.Column<string>(type: "text", nullable: false),
                    PathId = table.Column<string>(type: "text", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: true),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Details = table.Column<string>(type: "text", nullable: true),
                    Caution = table.Column<string>(type: "text", nullable: true),
                    Remarks = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "text", nullable: true),
                    PersonClassification = table.Column<string>(type: "text", nullable: true),
                    WarningMessage = table.Column<string>(type: "text", nullable: true),
                    RewardText = table.Column<string>(type: "text", nullable: true),
                    RewardMin = table.Column<int>(type: "integer", nullable: true),
                    RewardMax = table.Column<int>(type: "integer", nullable: true),
                    Sex = table.Column<string>(type: "text", nullable: true),
                    Race = table.Column<string>(type: "text", nullable: true),
                    Hair = table.Column<string>(type: "text", nullable: true),
                    Eyes = table.Column<string>(type: "text", nullable: true),
                    HeightMin = table.Column<int>(type: "integer", nullable: true),
                    HeightMax = table.Column<int>(type: "integer", nullable: true),
                    WeightMin = table.Column<int>(type: "integer", nullable: true),
                    WeightMax = table.Column<int>(type: "integer", nullable: true),
                    ScarsAndMarks = table.Column<string>(type: "text", nullable: true),
                    Complexion = table.Column<string>(type: "text", nullable: true),
                    Build = table.Column<string>(type: "text", nullable: true),
                    Nationality = table.Column<string>(type: "text", nullable: true),
                    PlaceOfBirth = table.Column<string>(type: "text", nullable: true),
                    Ncic = table.Column<string>(type: "text", nullable: true),
                    PublicationDate = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    ModifiedDate = table.Column<DateTime>(type: "timestamp without time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WantedPersons", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WantedAliases",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    WantedPersonId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WantedAliases", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WantedAliases_WantedPersons_WantedPersonId",
                        column: x => x.WantedPersonId,
                        principalTable: "WantedPersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WantedFiles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: true),
                    Url = table.Column<string>(type: "text", nullable: true),
                    WantedPersonId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WantedFiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WantedFiles_WantedPersons_WantedPersonId",
                        column: x => x.WantedPersonId,
                        principalTable: "WantedPersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WantedImages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Caption = table.Column<string>(type: "text", nullable: true),
                    OriginalUrl = table.Column<string>(type: "text", nullable: true),
                    LargeUrl = table.Column<string>(type: "text", nullable: true),
                    ThumbUrl = table.Column<string>(type: "text", nullable: true),
                    WantedPersonId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WantedImages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WantedImages_WantedPersons_WantedPersonId",
                        column: x => x.WantedPersonId,
                        principalTable: "WantedPersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WantedSubjects",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    WantedPersonId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WantedSubjects", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WantedSubjects_WantedPersons_WantedPersonId",
                        column: x => x.WantedPersonId,
                        principalTable: "WantedPersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WantedAliases_WantedPersonId",
                table: "WantedAliases",
                column: "WantedPersonId");

            migrationBuilder.CreateIndex(
                name: "IX_WantedFiles_WantedPersonId",
                table: "WantedFiles",
                column: "WantedPersonId");

            migrationBuilder.CreateIndex(
                name: "IX_WantedImages_WantedPersonId",
                table: "WantedImages",
                column: "WantedPersonId");

            migrationBuilder.CreateIndex(
                name: "IX_WantedSubjects_WantedPersonId",
                table: "WantedSubjects",
                column: "WantedPersonId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WantedAliases");

            migrationBuilder.DropTable(
                name: "WantedFiles");

            migrationBuilder.DropTable(
                name: "WantedImages");

            migrationBuilder.DropTable(
                name: "WantedSubjects");

            migrationBuilder.DropTable(
                name: "WantedPersons");
        }
    }
}
