using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FbiApi.Migrations
{
    /// <inheritdoc />
    public partial class AddPosterClassification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PosterClassification",
                table: "WantedPersons",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PosterClassification",
                table: "WantedPersons");
        }
    }
}
