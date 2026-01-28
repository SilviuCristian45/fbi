using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FbiApi.Migrations
{
    /// <inheritdoc />
    public partial class AddReportStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "LocationWantedPersons",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Status",
                table: "LocationWantedPersons");
        }
    }
}
